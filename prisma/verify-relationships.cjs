// verify-relationships.cjs
// Verification script to check all Budget → Contract relationships

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  const tenantId = 'demo';

  console.log('🔍 Verifying all relationships...\n');
  console.log('='.repeat(70));

  try {
    // 1. Budget Lines → Packages (via PackageItem)
    console.log('\n1️⃣  Budget Lines → Packages (via PackageItem)');
    console.log('-'.repeat(70));
    const packageItems = await prisma.packageItem.findMany({
      where: { tenantId },
      include: {
        package: true,
        budgetLine: true
      }
    });
    console.log(`   ✓ Found ${packageItems.length} Package-Budget links`);

    if (packageItems.length > 0) {
      console.log('   Sample links:');
      packageItems.slice(0, 3).forEach(link => {
        console.log(`      • ${link.package?.name || 'Unknown'} ← ${link.budgetLine?.code || 'Unknown'}: ${link.budgetLine?.description}`);
      });
    }

    // Check for packages without budget links
    const packagesWithoutBudget = await prisma.package.findMany({
      where: {
        tenantId,
        budgetItems: {
          none: {}
        }
      }
    });
    if (packagesWithoutBudget.length > 0) {
      console.log(`   ⚠️  WARNING: ${packagesWithoutBudget.length} packages without budget links`);
      packagesWithoutBudget.forEach(p => console.log(`      - ${p.name}`));
    }

    // 2. Packages → Tenders
    console.log('\n2️⃣  Packages → Tenders');
    console.log('-'.repeat(70));
    const tenders = await prisma.tender.findMany({
      where: { tenantId },
      include: {
        package: true,
        project: true
      }
    });
    console.log(`   ✓ Found ${tenders.length} tenders`);
    tenders.forEach(t => {
      console.log(`      • ${t.title}`);
      console.log(`        Package: ${t.package?.name || 'None'}`);
      console.log(`        Status: ${t.status}`);
    });

    // 3. Tenders → Questions
    console.log('\n3️⃣  Tenders → Questions');
    console.log('-'.repeat(70));
    for (const tender of tenders) {
      const questions = await prisma.tenderQuestion.findMany({
        where: { tenderId: tender.id }
      });
      console.log(`   ${tender.title}: ${questions.length} questions`);

      if (questions.length < 8) {
        console.log(`      ⚠️  WARNING: Only ${questions.length} questions (expected 8-12)`);
      } else {
        console.log(`      ✓ Sufficient questions`);
      }
    }

    // 4. Tenders → Submissions
    console.log('\n4️⃣  Tenders → Submissions');
    console.log('-'.repeat(70));
    let totalSubmissions = 0;
    for (const tender of tenders) {
      const submissions = await prisma.tenderResponse.findMany({
        where: { tenderId: tender.id },
        include: { supplier: true }
      });
      totalSubmissions += submissions.length;
      console.log(`   ${tender.title}: ${submissions.length} submissions`);
      submissions.forEach(sub => {
        console.log(`      → ${sub.supplier?.name || 'Unknown supplier'} (Rank: ${sub.rank || 'not ranked'})`);
      });
    }
    console.log(`   ✓ Total submissions: ${totalSubmissions}`);

    // 5. Submissions → Answers
    console.log('\n5️⃣  Submissions → Answers');
    console.log('-'.repeat(70));
    const submissions = await prisma.tenderResponse.findMany({
      where: { tenantId },
      include: {
        supplier: true,
        tender: {
          include: {
            questions: true
          }
        }
      }
    });

    for (const sub of submissions) {
      const answers = await prisma.tenderAnswer.findMany({
        where: { responseId: sub.id }
      });
      const questionCount = sub.tender?.questions?.length || 0;
      const status = answers.length === questionCount ? '✓' : '⚠️';
      console.log(`   ${status} ${sub.supplier?.name || 'Unknown'}: ${answers.length}/${questionCount} answers`);

      if (answers.length < questionCount) {
        console.log(`      ⚠️  WARNING: Missing ${questionCount - answers.length} answers`);
      }
    }

    // 6. Submissions → Scores
    console.log('\n6️⃣  Submissions → Scores & Rankings');
    console.log('-'.repeat(70));
    const scores = await prisma.tenderResponse.findMany({
      where: {
        tenantId,
        technicalScore: { not: null }
      },
      include: {
        supplier: true
      },
      orderBy: { rank: 'asc' }
    });

    if (scores.length > 0) {
      console.log(`   ✓ Found ${scores.length} scored submissions`);
      scores.forEach(score => {
        const rankEmoji = score.rank === 1 ? '🥇' : score.rank === 2 ? '🥈' : score.rank === 3 ? '🥉' : '  ';
        console.log(`   ${rankEmoji} Rank ${score.rank}: ${score.supplier?.name || 'Unknown'} - ${Math.round(score.technicalScore || 0)}/100`);
      });
    } else {
      console.log(`   ⚠️  WARNING: No scored submissions found`);
    }

    // 7. Awards
    console.log('\n7️⃣  Tender Awards');
    console.log('-'.repeat(70));
    const awards = await prisma.award.findMany({
      where: { tenantId },
      include: {
        tender: true,
        supplier: true,
        response: true
      }
    });
    console.log(`   ✓ Found ${awards.length} awards`);
    awards.forEach(award => {
      console.log(`      • Tender: ${award.tender?.title || 'Unknown'}`);
      console.log(`        Awarded to: ${award.supplier?.name || 'Unknown'}`);
      console.log(`        Value: $${award.value?.toLocaleString() || '0'}`);
    });

    // 8. Contracts
    console.log('\n8️⃣  Contracts');
    console.log('-'.repeat(70));
    const contracts = await prisma.contract.findMany({
      where: { tenantId },
      include: {
        package: true,
        supplier: true,
        award: {
          include: {
            tender: true
          }
        }
      }
    });
    console.log(`   ✓ Found ${contracts.length} contracts`);
    contracts.forEach(contract => {
      console.log(`      • ${contract.contractNumber || 'No number'}`);
      console.log(`        Package: ${contract.package?.name || 'None'}`);
      console.log(`        Supplier: ${contract.supplier?.name || 'Unknown'}`);
      console.log(`        Value: $${contract.value?.toLocaleString() || '0'}`);
      console.log(`        Status: ${contract.status}`);
    });

    // 9. Contract → Documents
    console.log('\n9️⃣  Contract Documents');
    console.log('-'.repeat(70));
    for (const contract of contracts) {
      const docs = await prisma.contractDocument.findMany({
        where: { contractId: contract.id }
      });
      const signedCount = docs.filter(d => d.isSigned).length;
      console.log(`   ${contract.contractNumber || 'Contract'}: ${docs.length} documents (${signedCount} signed)`);
      docs.forEach(doc => {
        const signedIcon = doc.isSigned ? '✓' : '○';
        console.log(`      ${signedIcon} ${doc.name} (${doc.type})`);
      });
    }

    // 10. Complete Workflow Trace
    console.log('\n🔟  Complete Workflow Trace');
    console.log('-'.repeat(70));

    if (contracts.length > 0) {
      const contract = contracts[0];
      console.log('   Tracing complete path for: ' + (contract.contractNumber || 'First Contract'));

      // Get package
      const pkg = await prisma.package.findUnique({
        where: { id: contract.packageId },
        include: {
          budgetItems: {
            include: {
              budgetLine: true
            }
          }
        }
      });

      console.log(`   └─ Contract: ${contract.contractNumber}`);
      console.log(`      └─ Package: ${pkg?.name || 'Unknown'}`);
      console.log(`         └─ Budget Lines: ${pkg?.budgetItems?.length || 0}`);
      pkg?.budgetItems?.slice(0, 3).forEach(item => {
        console.log(`            • ${item.budgetLine?.code}: ${item.budgetLine?.description}`);
      });

      console.log(`      └─ Award to: ${contract.supplier?.name}`);
      if (contract.award?.tender) {
        console.log(`         └─ Via Tender: ${contract.award.tender.title}`);
      }
    }

    // Final Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 VERIFICATION SUMMARY');
    console.log('='.repeat(70));

    const budgetLineCount = await prisma.budgetLine.count({ where: { tenantId } });
    const packageCount = await prisma.package.count({ where: { tenantId } });
    const tenderCount = await prisma.tender.count({ where: { tenantId } });
    const questionCount = await prisma.tenderQuestion.count({ where: { tenantId } });
    const submissionCount = await prisma.tenderResponse.count({ where: { tenantId } });
    const answerCount = await prisma.tenderAnswer.count({ where: { tenantId } });
    const awardCount = await prisma.award.count({ where: { tenantId } });
    const contractCount = await prisma.contract.count({ where: { tenantId } });
    const documentCount = await prisma.contractDocument.count({ where: { tenantId } });

    console.log('\nEntity Counts:');
    console.log(`   Budget Lines: ${budgetLineCount}`);
    console.log(`   Packages: ${packageCount}`);
    console.log(`   Package-Budget Links: ${packageItems.length}`);
    console.log(`   Tenders: ${tenderCount}`);
    console.log(`   Questions: ${questionCount}`);
    console.log(`   Submissions: ${submissionCount}`);
    console.log(`   Answers: ${answerCount}`);
    console.log(`   Awards: ${awardCount}`);
    console.log(`   Contracts: ${contractCount}`);
    console.log(`   Documents: ${documentCount}`);

    console.log('\nRelationship Checks:');
    console.log(`   ${packageItems.length > 0 ? '✓' : '✗'} Packages linked to budget`);
    console.log(`   ${tenderCount > 0 ? '✓' : '✗'} Tenders exist`);
    console.log(`   ${questionCount >= tenderCount * 8 ? '✓' : '⚠️'} Sufficient questions per tender`);
    console.log(`   ${submissionCount >= tenderCount * 3 ? '✓' : '⚠️'} Sufficient submissions per tender`);
    console.log(`   ${answerCount >= submissionCount * questionCount / tenderCount ? '✓' : '⚠️'} All questions answered`);
    console.log(`   ${scores.length > 0 ? '✓' : '✗'} Submissions scored and ranked`);
    console.log(`   ${awardCount > 0 ? '✓' : '✗'} Awards created`);
    console.log(`   ${contractCount > 0 ? '✓' : '✗'} Contracts created`);
    console.log(`   ${documentCount >= contractCount * 4 ? '✓' : '⚠️'} Contract documents exist`);

    console.log('\n✅ Verification complete!\n');

  } catch (error) {
    console.error('\n❌ Verification error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

verify().catch(console.error);
