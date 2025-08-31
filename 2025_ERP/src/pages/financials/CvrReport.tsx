import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface CostCodeRow {
  code: string;
  budget: number;
  committed: number;
  actual: number;
  forecast: number;
  margin: number;
  marginPct: number | null;
}

interface TrendPoint {
  period: string;
  value: number;
  cost: number;
}

interface CvrData {
  byCostCode: CostCodeRow[];
  totals: {
    budget: number;
    committed: number;
    actual: number;
    forecast: number;
    value: number;
    cost: number;
    margin: number;
    marginPct: number | null;
  };
  trend: TrendPoint[];
}

const CvrReport: React.FC<{ projectId: number }> = ({ projectId }) => {
  const [data, setData] = useState<CvrData | null>(null);

  useEffect(() => {
    fetch(`/api/financials/${projectId}/cvr`)
      .then((r) => r.json())
      .then((json) => setData(json.data))
      .catch(() => setData(null));
  }, [projectId]);

  if (!data) return <div>Loading...</div>;

  return (
    <div>
      <h1>Cost Value Reconciliation</h1>
      <table>
        <thead>
          <tr>
            <th>Cost Code</th>
            <th>Budget</th>
            <th>Committed</th>
            <th>Actual</th>
            <th>Forecast</th>
            <th>Margin</th>
          </tr>
        </thead>
        <tbody>
          {data.byCostCode.map((row) => (
            <tr key={row.code}>
              <td>{row.code}</td>
              <td>{row.budget}</td>
              <td>{row.committed}</td>
              <td>{row.actual}</td>
              <td>{row.forecast}</td>
              <td>{row.margin}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data.trend}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="cost" stroke="#8884d8" />
          <Line type="monotone" dataKey="value" stroke="#82ca9d" />
        </LineChart>
      </ResponsiveContainer>
      <p>Margin: {data.totals.margin} ({data.totals.marginPct ?? 0}%)</p>
      <a href={`/api/financials/${projectId}/cvr?format=csv`}>Export CSV</a>
    </div>
  );
};

export default CvrReport;
