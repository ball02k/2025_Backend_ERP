// routes/reports.cjs
const express = require('express');
const { requirePerm } = require('../middleware/checkPermission.cjs');

module.exports = (prisma) => {
  const router = express.Router();

  // ============================================================================
  // LABOUR VS TRAVEL TIME REPORT
  // ============================================================================

  // GET /api/reports/labour-travel-time
  router.get('/labour-travel-time', requirePerm('reports:view'), async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      const { startDate, endDate, workerId, groupBy = 'worker' } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: { message: 'startDate and endDate are required' },
        });
      }

      const where = {
        tenantId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        status: { in: ['SUBMITTED', 'APPROVED', 'PAID'] },
      };

      if (workerId) {
        where.workerId = workerId;
      }

      // Get all time entries with worker info
      const timeEntries = await prisma.timeEntry.findMany({
        where,
        include: {
          worker: {
            select: {
              id: true,
              workerNumber: true,
              firstName: true,
              lastName: true,
            },
          },
          job: {
            select: {
              id: true,
              jobNumber: true,
              title: true,
            },
          },
        },
      });

      // Aggregate by groupBy parameter
      const aggregated = {};

      timeEntries.forEach((entry) => {
        const key =
          groupBy === 'worker'
            ? `${entry.worker.firstName} ${entry.worker.lastName}`
            : groupBy === 'job'
            ? entry.job?.jobNumber || 'No Job'
            : new Date(entry.date).toISOString().split('T')[0]; // Date

        if (!aggregated[key]) {
          aggregated[key] = {
            name: key,
            labourHours: 0,
            travelHours: 0,
            totalHours: 0,
            labourCost: 0,
            travelCost: 0,
            totalCost: 0,
            entries: 0,
          };

          if (groupBy === 'worker') {
            aggregated[key].workerId = entry.workerId;
            aggregated[key].workerNumber = entry.worker.workerNumber;
          } else if (groupBy === 'job') {
            aggregated[key].jobId = entry.jobId;
            aggregated[key].jobTitle = entry.job?.title;
          }
        }

        const labourHours = parseFloat(entry.hoursWorked) || 0;
        const travelHours = parseFloat(entry.travelHours) || 0;
        const hourlyRate = parseFloat(entry.hourlyRate) || 0;

        aggregated[key].labourHours += labourHours;
        aggregated[key].travelHours += travelHours;
        aggregated[key].totalHours += labourHours + travelHours;
        aggregated[key].labourCost += labourHours * hourlyRate;
        aggregated[key].travelCost += travelHours * hourlyRate;
        aggregated[key].totalCost += (labourHours + travelHours) * hourlyRate;
        aggregated[key].entries += 1;
      });

      // Calculate percentages
      const results = Object.values(aggregated).map((item) => ({
        ...item,
        labourPercentage: item.totalHours > 0 ? (item.labourHours / item.totalHours) * 100 : 0,
        travelPercentage: item.totalHours > 0 ? (item.travelHours / item.totalHours) * 100 : 0,
      }));

      // Sort by total hours descending
      results.sort((a, b) => b.totalHours - a.totalHours);

      // Calculate totals
      const totals = {
        labourHours: results.reduce((sum, r) => sum + r.labourHours, 0),
        travelHours: results.reduce((sum, r) => sum + r.travelHours, 0),
        totalHours: results.reduce((sum, r) => sum + r.totalHours, 0),
        labourCost: results.reduce((sum, r) => sum + r.labourCost, 0),
        travelCost: results.reduce((sum, r) => sum + r.travelCost, 0),
        totalCost: results.reduce((sum, r) => sum + r.totalCost, 0),
        entries: results.reduce((sum, r) => sum + r.entries, 0),
      };

      totals.labourPercentage = totals.totalHours > 0 ? (totals.labourHours / totals.totalHours) * 100 : 0;
      totals.travelPercentage = totals.totalHours > 0 ? (totals.travelHours / totals.totalHours) * 100 : 0;

      res.json({
        success: true,
        data: {
          results,
          totals,
          groupBy,
          dateRange: { startDate, endDate },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // PLANNED VS ACTUAL DURATIONS REPORT
  // ============================================================================

  // GET /api/reports/planned-vs-actual
  router.get('/planned-vs-actual', requirePerm('reports:view'), async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      const { startDate, endDate, status } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: { message: 'startDate and endDate are required' },
        });
      }

      const where = {
        tenantId,
        isDeleted: false,
        schedules: {
          some: {
            startTime: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
        },
      };

      if (status) {
        where.status = status;
      }

      const jobs = await prisma.job.findMany({
        where,
        include: {
          schedules: {
            where: {
              startTime: {
                gte: new Date(startDate),
                lte: new Date(endDate),
              },
            },
            include: {
              worker: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          timeEntries: {
            where: {
              status: { in: ['SUBMITTED', 'APPROVED', 'PAID'] },
              date: {
                gte: new Date(startDate),
                lte: new Date(endDate),
              },
            },
          },
        },
      });

      const results = jobs.map((job) => {
        // Calculate planned duration from schedules
        let plannedHours = 0;
        job.schedules.forEach((schedule) => {
          if (schedule.startTime && schedule.endTime) {
            const duration = (new Date(schedule.endTime) - new Date(schedule.startTime)) / (1000 * 60 * 60);
            plannedHours += duration;
          }
        });

        // Calculate actual duration from time entries
        const actualHours = job.timeEntries.reduce(
          (sum, entry) => sum + (parseFloat(entry.hoursWorked) || 0),
          0
        );

        const variance = actualHours - plannedHours;
        const variancePercentage = plannedHours > 0 ? (variance / plannedHours) * 100 : 0;

        return {
          jobId: job.id,
          jobNumber: job.jobNumber,
          title: job.title,
          status: job.status,
          plannedHours: parseFloat(plannedHours.toFixed(2)),
          actualHours: parseFloat(actualHours.toFixed(2)),
          variance: parseFloat(variance.toFixed(2)),
          variancePercentage: parseFloat(variancePercentage.toFixed(2)),
          schedules: job.schedules.length,
          timeEntries: job.timeEntries.length,
          onTrack: Math.abs(variancePercentage) <= 10,
          overrun: variancePercentage > 10,
          underrun: variancePercentage < -10,
        };
      });

      // Sort by variance percentage descending (biggest overruns first)
      results.sort((a, b) => b.variancePercentage - a.variancePercentage);

      // Calculate summary statistics
      const summary = {
        totalJobs: results.length,
        totalPlannedHours: results.reduce((sum, r) => sum + r.plannedHours, 0),
        totalActualHours: results.reduce((sum, r) => sum + r.actualHours, 0),
        totalVariance: results.reduce((sum, r) => sum + r.variance, 0),
        onTrack: results.filter((r) => r.onTrack).length,
        overrun: results.filter((r) => r.overrun).length,
        underrun: results.filter((r) => r.underrun).length,
        avgVariancePercentage:
          results.length > 0
            ? results.reduce((sum, r) => sum + r.variancePercentage, 0) / results.length
            : 0,
      };

      res.json({
        success: true,
        data: {
          results,
          summary,
          dateRange: { startDate, endDate },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // JOB PROFITABILITY REPORT
  // ============================================================================

  // GET /api/reports/job-profitability
  router.get('/job-profitability', requirePerm('reports:view'), async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      const { startDate, endDate, status, minRevenue } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: { message: 'startDate and endDate are required' },
        });
      }

      const where = {
        tenantId,
        isDeleted: false,
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      };

      if (status) {
        where.status = status;
      }

      const jobs = await prisma.job.findMany({
        where,
        include: {
          timeEntries: {
            where: {
              status: { in: ['SUBMITTED', 'APPROVED', 'PAID'] },
            },
          },
          materials: {
            where: {
              isDeleted: false,
            },
          },
          invoices: {
            where: {
              status: { in: ['SENT', 'PAID', 'PARTIALLY_PAID'] },
            },
          },
          quotes: true,
        },
      });

      const results = jobs
        .map((job) => {
          // Calculate labour costs
          const labourCost = job.timeEntries.reduce((sum, entry) => {
            const hours = parseFloat(entry.hoursWorked) || 0;
            const rate = parseFloat(entry.hourlyRate) || 0;
            return sum + hours * rate;
          }, 0);

          // Calculate material costs
          const materialCost = job.materials.reduce((sum, material) => {
            const qty = parseFloat(material.quantity) || 0;
            const cost = parseFloat(material.unitCost) || 0;
            return sum + qty * cost;
          }, 0);

          // Calculate total costs
          const totalCost = labourCost + materialCost;

          // Calculate revenue from invoices
          let revenue = job.invoices.reduce((sum, invoice) => {
            return sum + (parseFloat(invoice.totalAmount) || 0);
          }, 0);

          // If no invoices, use quote value
          if (revenue === 0 && job.quotes.length > 0) {
            const latestQuote = job.quotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
            if (latestQuote && latestQuote.status === 'ACCEPTED') {
              revenue = parseFloat(latestQuote.totalAmount) || 0;
            }
          }

          const profit = revenue - totalCost;
          const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

          return {
            jobId: job.id,
            jobNumber: job.jobNumber,
            title: job.title,
            status: job.status,
            revenue: parseFloat(revenue.toFixed(2)),
            labourCost: parseFloat(labourCost.toFixed(2)),
            materialCost: parseFloat(materialCost.toFixed(2)),
            totalCost: parseFloat(totalCost.toFixed(2)),
            profit: parseFloat(profit.toFixed(2)),
            profitMargin: parseFloat(profitMargin.toFixed(2)),
            labourHours: job.timeEntries.reduce((sum, entry) => sum + (parseFloat(entry.hoursWorked) || 0), 0),
            materialItems: job.materials.length,
            invoiceCount: job.invoices.length,
            isProfitable: profit > 0,
            isBreakEven: Math.abs(profit) < 1,
            isUnprofitable: profit < -1,
          };
        })
        .filter((job) => {
          if (minRevenue) {
            return job.revenue >= parseFloat(minRevenue);
          }
          return true;
        });

      // Sort by profit margin descending
      results.sort((a, b) => b.profitMargin - a.profitMargin);

      // Calculate summary
      const summary = {
        totalJobs: results.length,
        totalRevenue: results.reduce((sum, r) => sum + r.revenue, 0),
        totalLabourCost: results.reduce((sum, r) => sum + r.labourCost, 0),
        totalMaterialCost: results.reduce((sum, r) => sum + r.materialCost, 0),
        totalCost: results.reduce((sum, r) => sum + r.totalCost, 0),
        totalProfit: results.reduce((sum, r) => sum + r.profit, 0),
        profitable: results.filter((r) => r.isProfitable).length,
        breakEven: results.filter((r) => r.isBreakEven).length,
        unprofitable: results.filter((r) => r.isUnprofitable).length,
        avgProfitMargin:
          results.length > 0 ? results.reduce((sum, r) => sum + r.profitMargin, 0) / results.length : 0,
      };

      summary.overallProfitMargin = summary.totalRevenue > 0 ? (summary.totalProfit / summary.totalRevenue) * 100 : 0;

      res.json({
        success: true,
        data: {
          results,
          summary,
          dateRange: { startDate, endDate },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // ENGINEER UTILISATION REPORT
  // ============================================================================

  // GET /api/reports/engineer-utilisation
  router.get('/engineer-utilisation', requirePerm('reports:view'), async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      const { startDate, endDate, workerId } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: { message: 'startDate and endDate are required' },
        });
      }

      const where = {
        tenantId,
        isActive: true,
        isDeleted: false,
      };

      if (workerId) {
        where.id = workerId;
      }

      const workers = await prisma.worker.findMany({
        where,
        include: {
          timeEntries: {
            where: {
              date: {
                gte: new Date(startDate),
                lte: new Date(endDate),
              },
              status: { in: ['SUBMITTED', 'APPROVED', 'PAID'] },
            },
          },
          schedules: {
            where: {
              startTime: {
                gte: new Date(startDate),
                lte: new Date(endDate),
              },
              status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
            },
          },
        },
      });

      // Calculate working days in period
      const start = new Date(startDate);
      const end = new Date(endDate);
      let workingDays = 0;
      const currentDate = new Date(start);

      while (currentDate <= end) {
        const day = currentDate.getDay();
        if (day !== 0 && day !== 6) {
          // Exclude weekends
          workingDays++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const standardHoursPerDay = 8;
      const availableHours = workingDays * standardHoursPerDay;

      const results = workers.map((worker) => {
        // Calculate billable hours (actual work logged)
        const billableHours = worker.timeEntries.reduce(
          (sum, entry) => sum + (parseFloat(entry.hoursWorked) || 0),
          0
        );

        // Calculate scheduled hours
        const scheduledHours = worker.schedules.reduce((sum, schedule) => {
          if (schedule.startTime && schedule.endTime) {
            const duration = (new Date(schedule.endTime) - new Date(schedule.startTime)) / (1000 * 60 * 60);
            return sum + duration;
          }
          return sum;
        }, 0);

        // Calculate travel hours
        const travelHours = worker.timeEntries.reduce(
          (sum, entry) => sum + (parseFloat(entry.travelHours) || 0),
          0
        );

        const totalWorkedHours = billableHours + travelHours;
        const utilisation = availableHours > 0 ? (billableHours / availableHours) * 100 : 0;
        const scheduleAdherence = scheduledHours > 0 ? (totalWorkedHours / scheduledHours) * 100 : 0;

        // Calculate revenue generated
        const revenueGenerated = worker.timeEntries.reduce((sum, entry) => {
          const hours = parseFloat(entry.hoursWorked) || 0;
          const rate = parseFloat(entry.hourlyRate) || 0;
          return sum + hours * rate;
        }, 0);

        return {
          workerId: worker.id,
          workerNumber: worker.workerNumber,
          name: `${worker.firstName} ${worker.lastName}`,
          role: worker.role,
          availableHours: parseFloat(availableHours.toFixed(2)),
          billableHours: parseFloat(billableHours.toFixed(2)),
          travelHours: parseFloat(travelHours.toFixed(2)),
          totalWorkedHours: parseFloat(totalWorkedHours.toFixed(2)),
          scheduledHours: parseFloat(scheduledHours.toFixed(2)),
          utilisation: parseFloat(utilisation.toFixed(2)),
          scheduleAdherence: parseFloat(scheduleAdherence.toFixed(2)),
          revenueGenerated: parseFloat(revenueGenerated.toFixed(2)),
          jobsWorked: new Set(worker.timeEntries.map((e) => e.jobId)).size,
          timeEntries: worker.timeEntries.length,
          schedules: worker.schedules.length,
          isFullyUtilised: utilisation >= 90,
          isWellUtilised: utilisation >= 70 && utilisation < 90,
          isUnderutilised: utilisation < 70,
        };
      });

      // Sort by utilisation descending
      results.sort((a, b) => b.utilisation - a.utilisation);

      // Calculate summary
      const summary = {
        totalWorkers: results.length,
        avgUtilisation:
          results.length > 0 ? results.reduce((sum, r) => sum + r.utilisation, 0) / results.length : 0,
        avgScheduleAdherence:
          results.length > 0 ? results.reduce((sum, r) => sum + r.scheduleAdherence, 0) / results.length : 0,
        totalBillableHours: results.reduce((sum, r) => sum + r.billableHours, 0),
        totalTravelHours: results.reduce((sum, r) => sum + r.travelHours, 0),
        totalRevenueGenerated: results.reduce((sum, r) => sum + r.revenueGenerated, 0),
        fullyUtilised: results.filter((r) => r.isFullyUtilised).length,
        wellUtilised: results.filter((r) => r.isWellUtilised).length,
        underutilised: results.filter((r) => r.isUnderutilised).length,
        workingDays,
        standardHoursPerDay,
      };

      res.json({
        success: true,
        data: {
          results,
          summary,
          dateRange: { startDate, endDate },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // ASSET DOWNTIME REPORT
  // ============================================================================

  // GET /api/reports/asset-downtime
  router.get('/asset-downtime', requirePerm('reports:view'), async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      const { startDate, endDate, category, status } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: { message: 'startDate and endDate are required' },
        });
      }

      const where = {
        tenantId,
        isDeleted: false,
      };

      if (category) {
        where.category = category;
      }

      if (status) {
        where.status = status;
      }

      const equipment = await prisma.equipment.findMany({
        where,
        include: {
          schedules: {
            where: {
              startTime: {
                gte: new Date(startDate),
                lte: new Date(endDate),
              },
            },
          },
        },
      });

      // Calculate total period hours
      const start = new Date(startDate);
      const end = new Date(endDate);
      const periodDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      const totalPeriodHours = periodDays * 24;

      const results = equipment.map((asset) => {
        // Calculate scheduled/in-use hours
        const scheduledHours = asset.schedules.reduce((sum, schedule) => {
          if (schedule.startTime && schedule.endTime) {
            const duration = (new Date(schedule.endTime) - new Date(schedule.startTime)) / (1000 * 60 * 60);
            return sum + duration;
          }
          return sum;
        }, 0);

        // Calculate maintenance downtime
        let maintenanceHours = 0;
        if (asset.status === 'MAINTENANCE') {
          const maintenanceStart = asset.lastMaintenanceDate
            ? new Date(asset.lastMaintenanceDate)
            : new Date(startDate);
          const maintenanceEnd = new Date();

          if (maintenanceStart >= start && maintenanceStart <= end) {
            const downtime = (Math.min(maintenanceEnd, end) - maintenanceStart) / (1000 * 60 * 60);
            maintenanceHours = Math.max(0, downtime);
          }
        }

        // Calculate out of service downtime
        let outOfServiceHours = 0;
        if (asset.status === 'OUT_OF_SERVICE') {
          outOfServiceHours = totalPeriodHours; // Assume entire period if out of service
        }

        const totalDowntime = maintenanceHours + outOfServiceHours;
        const availableHours = totalPeriodHours - totalDowntime;
        const utilisation = availableHours > 0 ? (scheduledHours / availableHours) * 100 : 0;
        const downtimePercentage = totalPeriodHours > 0 ? (totalDowntime / totalPeriodHours) * 100 : 0;

        // Calculate days since last maintenance
        const daysSinceLastMaintenance = asset.lastMaintenanceDate
          ? Math.floor((new Date() - new Date(asset.lastMaintenanceDate)) / (1000 * 60 * 60 * 24))
          : null;

        // Check if maintenance is overdue
        const isMaintenanceOverdue =
          asset.nextMaintenanceDate && new Date(asset.nextMaintenanceDate) < new Date();

        return {
          equipmentId: asset.id,
          equipmentNumber: asset.equipmentNumber,
          name: asset.name,
          type: asset.type,
          category: asset.category,
          status: asset.status,
          totalPeriodHours: parseFloat(totalPeriodHours.toFixed(2)),
          scheduledHours: parseFloat(scheduledHours.toFixed(2)),
          maintenanceHours: parseFloat(maintenanceHours.toFixed(2)),
          outOfServiceHours: parseFloat(outOfServiceHours.toFixed(2)),
          totalDowntime: parseFloat(totalDowntime.toFixed(2)),
          availableHours: parseFloat(availableHours.toFixed(2)),
          utilisation: parseFloat(utilisation.toFixed(2)),
          downtimePercentage: parseFloat(downtimePercentage.toFixed(2)),
          lastMaintenanceDate: asset.lastMaintenanceDate,
          nextMaintenanceDate: asset.nextMaintenanceDate,
          daysSinceLastMaintenance,
          isMaintenanceOverdue,
          scheduleCount: asset.schedules.length,
          isHighDowntime: downtimePercentage > 20,
          isAvailable: asset.status === 'AVAILABLE',
        };
      });

      // Sort by downtime percentage descending
      results.sort((a, b) => b.downtimePercentage - a.downtimePercentage);

      // Calculate summary
      const summary = {
        totalAssets: results.length,
        avgDowntimePercentage:
          results.length > 0 ? results.reduce((sum, r) => sum + r.downtimePercentage, 0) / results.length : 0,
        avgUtilisation:
          results.length > 0 ? results.reduce((sum, r) => sum + r.utilisation, 0) / results.length : 0,
        totalScheduledHours: results.reduce((sum, r) => sum + r.scheduledHours, 0),
        totalMaintenanceHours: results.reduce((sum, r) => sum + r.maintenanceHours, 0),
        totalOutOfServiceHours: results.reduce((sum, r) => sum + r.outOfServiceHours, 0),
        totalDowntime: results.reduce((sum, r) => sum + r.totalDowntime, 0),
        highDowntime: results.filter((r) => r.isHighDowntime).length,
        maintenanceOverdue: results.filter((r) => r.isMaintenanceOverdue).length,
        available: results.filter((r) => r.isAvailable).length,
        inUse: results.filter((r) => r.status === 'IN_USE').length,
        maintenance: results.filter((r) => r.status === 'MAINTENANCE').length,
        outOfService: results.filter((r) => r.status === 'OUT_OF_SERVICE').length,
      };

      res.json({
        success: true,
        data: {
          results,
          summary,
          dateRange: { startDate, endDate },
          periodDays,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // EXPORT FUNCTIONALITY
  // ============================================================================

  // Helper function to convert data to CSV
  const convertToCSV = (data, headers) => {
    if (!data || data.length === 0) {
      return '';
    }

    const csvRows = [];

    // Add headers
    csvRows.push(headers.join(','));

    // Add data rows
    data.forEach((row) => {
      const values = headers.map((header) => {
        const value = row[header];
        // Escape quotes and wrap in quotes if contains comma
        const escaped = String(value).replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      });
      csvRows.push(values.join(','));
    });

    return csvRows.join('\n');
  };

  // POST /api/reports/export - Export any report to CSV
  router.post('/export', requirePerm('reports:view'), async (req, res, next) => {
    try {
      const { reportType, data, filename } = req.body;

      if (!reportType || !data) {
        return res.status(400).json({
          success: false,
          error: { message: 'reportType and data are required' },
        });
      }

      let headers = [];
      let rows = data;

      // Define headers based on report type
      switch (reportType) {
        case 'labour-travel-time':
          headers = [
            'name',
            'labourHours',
            'travelHours',
            'totalHours',
            'labourPercentage',
            'travelPercentage',
            'labourCost',
            'travelCost',
            'totalCost',
            'entries',
          ];
          break;

        case 'planned-vs-actual':
          headers = [
            'jobNumber',
            'title',
            'status',
            'plannedHours',
            'actualHours',
            'variance',
            'variancePercentage',
            'schedules',
            'timeEntries',
          ];
          break;

        case 'job-profitability':
          headers = [
            'jobNumber',
            'title',
            'status',
            'revenue',
            'labourCost',
            'materialCost',
            'totalCost',
            'profit',
            'profitMargin',
            'labourHours',
            'materialItems',
            'invoiceCount',
          ];
          break;

        case 'engineer-utilisation':
          headers = [
            'workerNumber',
            'name',
            'role',
            'availableHours',
            'billableHours',
            'travelHours',
            'totalWorkedHours',
            'scheduledHours',
            'utilisation',
            'scheduleAdherence',
            'revenueGenerated',
            'jobsWorked',
            'timeEntries',
            'schedules',
          ];
          break;

        case 'asset-downtime':
          headers = [
            'equipmentNumber',
            'name',
            'type',
            'category',
            'status',
            'totalPeriodHours',
            'scheduledHours',
            'maintenanceHours',
            'outOfServiceHours',
            'totalDowntime',
            'downtimePercentage',
            'utilisation',
            'lastMaintenanceDate',
            'nextMaintenanceDate',
            'daysSinceLastMaintenance',
            'isMaintenanceOverdue',
          ];
          break;

        default:
          return res.status(400).json({
            success: false,
            error: { message: 'Invalid report type' },
          });
      }

      const csv = convertToCSV(rows, headers);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename || reportType}.csv"`);
      res.send(csv);
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // DASHBOARD SUMMARY
  // ============================================================================

  // GET /api/reports/dashboard-summary
  router.get('/dashboard-summary', requirePerm('reports:view'), async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: { message: 'startDate and endDate are required' },
        });
      }

      // Get key metrics in parallel
      const [jobCount, workerCount, equipmentCount, totalRevenue, totalCost, timeEntryCount] = await Promise.all([
        // Active jobs
        prisma.job.count({
          where: {
            tenantId,
            isDeleted: false,
            status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
          },
        }),

        // Active workers
        prisma.worker.count({
          where: {
            tenantId,
            isActive: true,
            isDeleted: false,
          },
        }),

        // Available equipment
        prisma.equipment.count({
          where: {
            tenantId,
            status: 'AVAILABLE',
            isDeleted: false,
          },
        }),

        // Total revenue from invoices
        prisma.invoice.aggregate({
          where: {
            tenantId,
            status: { in: ['SENT', 'PAID', 'PARTIALLY_PAID'] },
            createdAt: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
          _sum: {
            totalAmount: true,
          },
        }),

        // Total cost from time entries
        prisma.timeEntry.findMany({
          where: {
            tenantId,
            status: { in: ['APPROVED', 'PAID'] },
            date: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
        }),

        // Time entries count
        prisma.timeEntry.count({
          where: {
            tenantId,
            date: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
        }),
      ]);

      // Calculate total cost
      const cost = totalCost.reduce((sum, entry) => {
        const hours = parseFloat(entry.hoursWorked) || 0;
        const rate = parseFloat(entry.hourlyRate) || 0;
        return sum + hours * rate;
      }, 0);

      const revenue = parseFloat(totalRevenue._sum.totalAmount) || 0;
      const profit = revenue - cost;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

      res.json({
        success: true,
        data: {
          activeJobs: jobCount,
          activeWorkers: workerCount,
          availableEquipment: equipmentCount,
          revenue: parseFloat(revenue.toFixed(2)),
          cost: parseFloat(cost.toFixed(2)),
          profit: parseFloat(profit.toFixed(2)),
          profitMargin: parseFloat(profitMargin.toFixed(2)),
          timeEntries: timeEntryCount,
          dateRange: { startDate, endDate },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
