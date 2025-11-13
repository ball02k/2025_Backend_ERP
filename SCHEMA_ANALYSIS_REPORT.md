# COMPLETE SCHEMA ANALYSIS REPORT
## 2025 Backend ERP - 136 Models Mapped

---

## 📊 EXECUTIVE SUMMARY

**Total Models:** 136
**Database:** PostgreSQL
**Primary Workflow:** Budget Lines → Packages → Tenders → Submissions → Scoring → Awards → Contracts

---

## 🔑 CRITICAL WORKFLOW MODELS

### 1. BUDGET STRUCTURE

#### BudgetLine (Model)
```prisma
model BudgetLine {
  id          Int      @id @default(autoincrement())
  tenantId    String   @default("demo")
  projectId   Int      → Project
  costCodeId  Int?     → CostCode (optional)
  groupId     Int?     → BudgetGroup (optional)

  // Line Details
  code        String?
  description String?
  qty         Decimal
  unit        String?
  rate        Decimal
  total       Decimal

  // Financial tracking
  planned     Decimal?
  estimated   Decimal?
  actual      Decimal?

  // Relations
  project       Project       → parent
  costCode      CostCode?     → grouping
  packageItems  PackageItem[] → links to packages ⭐
  contractLines ContractLineItem[]
}
```

#### CostCode (Model) - Optional Grouping
```prisma
model CostCode {
  id          Int      @id
  tenantId    String
  code        String   // e.g., "01", "02", "03"
  description String?  // e.g., "Preliminaries", "Substructure"
  parentId    Int?     → CostCode (hierarchy)

  // Relations
  parent      CostCode?    → self-reference
  children    CostCode[]   → children
  budgetLines BudgetLine[] → budget items
  packages    Package[]    → directly linked packages
}
```

#### BudgetGroup (Model) - Optional Grouping
```prisma
model BudgetGroup {
  id        Int
  tenantId  String
  projectId Int
  name      String
  sortOrder Int
  isSystem  Boolean

  budgetLines BudgetLine[]
}
```

**KEY INSIGHT:** Budget lines can be grouped by CostCode OR BudgetGroup (both optional)

---

### 2. PACKAGES

#### Package (Model) - The Central Hub
```prisma
model Package {
  id                  Int
  projectId           Int      → Project
  costCodeId          Int?     → CostCode (optional direct link)

  // Core fields
  name                String
  scopeSummary        String?
  trade               String?
  status              String   // "Draft", "Active", "Awarded"

  // Pricing fields (NEW)
  pricingMode        PricingMode  // LUMP_SUM | MEASURED | HYBRID
  breakdownMandatory Boolean      // require BOQ breakdown?
  budgetEstimate     Decimal?
  estimatedValue     Decimal?
  budgetValue        Decimal?

  // Award tracking
  awardValue          Decimal?
  awardSupplierId     Int?      → Supplier
  awardedValue        Decimal?
  awardedAt           DateTime?

  // Ownership
  ownerUserId         Int?      → User
  buyerUserId         Int?      → User

  // Relations ⭐ CRITICAL
  project             Project
  costCode            CostCode?
  budgetItems         PackageItem[]        ← links to budget lines ⭐
  lineItems           PackageLineItem[]    ← BOQ snapshot
  tenders             Tender[]             ← generated tenders
  contracts           Contract[]           ← resulting contracts
  awards              Award[]              ← award decisions
  packageResponses    PackageResponse[]    ← supplier pricing
}
```

#### PackageItem (Model) - **CRITICAL JOIN TABLE**
```prisma
model PackageItem {
  id           Int
  tenantId     String
  packageId    Int      → Package     ⭐
  budgetLineId Int      → BudgetLine  ⭐

  package    Package
  budgetLine BudgetLine
}
```

**KEY INSIGHT:** `PackageItem` is the JOIN TABLE that links packages to budget lines!

#### PackageLineItem (Model) - BOQ Snapshot
```prisma
model PackageLineItem {
  id               Int
  packageId        Int → Package
  budgetLineItemId Int? // reference to original budget line (not FK)

  // Line identification
  itemNumber      String?  // "1.1", "2.3.4"
  section         String?  // "Excavation", "Concrete"
  description     String
  specification   String?

  // Quantities
  qty             Decimal
  quantity        Decimal? // alias
  unit            String?  // m³, m², nr, etc.

  // Rates
  rate            Decimal
  total           Decimal
  estimatedRate   Decimal? // buyer's estimate (hidden from suppliers)
  estimatedTotal  Decimal?

  // Display
  displayOrder    Int
  isMandatory     Boolean
  allowAlternative Boolean

  // Relations
  package        Package
  contractLines  ContractLineItem[]
  supplierPrices SupplierLinePrice[] ← supplier pricing per line
}
```

---

### 3. TENDER SYSTEM

#### Tender (Model) - Main Tender Entity
```prisma
model Tender {
  id              Int
  tenantId        String
  projectId       Int      → Project
  packageId       Int?     → Package ⭐

  title           String
  description     String?
  status          String   // "draft", "issued", "evaluating", "awarded", "closed"
  deadlineAt      DateTime?
  invitedCount    Int
  submissionCount Int

  // Relations
  project   Project
  package   Package?             ← linked to package
  sections  TenderSection[]      ← questionnaire sections
  questions TenderQuestion[]     ← questions
  responses TenderResponse[]     ← supplier responses
  invites   TenderSupplierInvite[]
  bids      TenderBid[]
}
```

#### TenderSection (Model) - Question Grouping
```prisma
model TenderSection {
  id          Int
  tenantId    String
  tenderId    Int      → Tender
  name        String
  description String?
  orderIndex  Int

  tender    Tender
  questions TenderQuestion[]
}
```

#### TenderQuestion (Model) - Individual Questions
```prisma
model TenderQuestion {
  id        Int
  tenantId  String
  tenderId  Int      → Tender
  sectionId Int?     → TenderSection (optional grouping)

  text      String
  type      String   // 'text', 'textarea', 'number', 'single', 'multi', 'file', 'yes_no', etc.
  weight    Float    // scoring weight (can be 0 for non-scored questions)
  options   Json?    // for multiple choice

  isRequired       Boolean
  helpText         String?
  orderIndex       Int
  referenceDocUrl  String?  // link to specs/drawings
  referenceDocName String?
  scoringCriteria  String?  // how to score this question

  tender  Tender
  section TenderSection?
}
```

**CRITICAL INSIGHT:** Questions can be scored (weight > 0) or informational (weight = 0)

---

### 4. SUBMISSIONS & RESPONSES

#### TenderSubmission (Model) - Legacy/Simple Submission
```prisma
model TenderSubmission {
  id          Int
  tenantId    String
  tenderId    Int      → Tender
  supplierId  Int      → Supplier
  accessToken String   @unique // for supplier portal access

  status      String   // 'draft' | 'submitted'
  formData    Json?
  totalPrice  Decimal
  submittedAt DateTime?

  // Relations
  supplier Supplier
  items    TenderSubmissionItem[] ← line item pricing
  qnas     TenderQnA[]            ← Q&A threads
  scores   TenderScore[]          ← evaluation scores
}
```

#### TenderResponse (Model) - **NEW** Advanced Response
```prisma
model TenderResponse {
  id           Int
  tenantId     String
  tenderId     Int      → Tender
  supplierId   Int      → Supplier

  // Pricing
  priceTotal   Decimal
  totalBidValue Decimal? // overall bid across all packages
  leadTimeDays Int?

  // Answers
  answers      Json     // questionnaire answers
  autoScore    Float
  manualScore  Float
  notes        String?

  // Source tracking
  source       String   // 'supplier' | 'buyer' (buyer-entered)
  attachments  Json?
  submittedAt  DateTime

  // Relations
  tender           Tender
  supplier         Supplier
  packageResponses PackageResponse[] ← per-package pricing details
}
```

#### PackageResponse (Model) - **CRITICAL** Detailed Package Pricing
```prisma
model PackageResponse {
  id               Int
  tenantId         String
  packageId        Int → Package        ⭐
  tenderResponseId Int → TenderResponse ⭐
  supplierId       Int → Supplier

  // Pricing approach
  pricingType  ResponsePricingType  // LUMP_SUM_ONLY | ITEMIZED_ONLY | HYBRID_WITH_BREAKDOWN
  packageTotal Decimal              // always required

  // Commercial terms
  preliminaries         Decimal?
  contingency           Decimal?
  overheadsProfit       Decimal?

  // Programme
  programmeDuration Int?
  startDate         DateTime?
  completionDate    DateTime?
  keyMilestones     Json?

  // Commercial details
  paymentTerms        String?
  retentionPercentage Decimal?
  defectsLiability    Int?
  warranties          String?
  bondRequired        Boolean
  insuranceDetails    String?

  // Qualifications
  assumptions    Json?
  exclusions     Json?
  clarifications Json?
  alternatives   Json?

  // Technical
  technicalCompliance Boolean?
  complianceNotes     String?
  deviations          Json?

  // Resources
  keyPersonnel   Json?
  subcontractors Json?
  plantEquipment Json?

  // Quality & Safety
  qualityPlan     String?
  safetyPlan      String?
  methodStatement String?

  // Evaluation
  status          String   // draft, submitted, under_review, accepted, rejected
  technicalScore  Decimal?
  commercialScore Decimal?
  programmeScore  Decimal?
  totalScore      Decimal?
  evaluationNotes String?

  // Relations
  package        Package
  tenderResponse TenderResponse
  supplier       Supplier
  lineItemPrices SupplierLinePrice[] ← optional BOQ breakdown
}
```

#### SupplierLinePrice (Model) - Optional Line Item Breakdown
```prisma
model SupplierLinePrice {
  id                Int
  tenantId          String
  packageResponseId Int → PackageResponse ⭐
  lineItemId        Int → PackageLineItem  ⭐

  // Pricing
  rate  Decimal?  // unit rate (null if lump sum)
  total Decimal   // line total

  // Notes
  notes         String?
  alternative   String?
  specification String?

  // Build-up (optional transparency)
  labourCost      Decimal?
  materialCost    Decimal?
  plantCost       Decimal?
  subcontractCost Decimal?

  // Relations
  packageResponse PackageResponse
  lineItem        PackageLineItem
}
```

---

### 5. SCORING & EVALUATION

#### TenderCriteria (Model) - Evaluation Criteria
```prisma
model TenderCriteria {
  id       Int
  tenantId String
  tenderId Int → Tender

  name   String   // "Technical Quality", "Price", "Programme", "H&S", etc.
  weight Decimal  // weighting (must sum to 100%)
  type   String   // 'price' | 'technical' | 'programme' | 'h&s' | 'esg' | 'past' | 'risk'

  scores TenderScore[]
}
```

#### TenderScore (Model) - Evaluation Scores
```prisma
model TenderScore {
  id             Int
  tenantId       String
  criteriaId     Int → TenderCriteria
  submissionId   Int → TenderSubmission

  autoScore      Decimal?  // calculated score
  manualScore    Decimal?  // evaluator override
  overrideReason String?   // why manual override used

  criteria   TenderCriteria
  submission TenderSubmission
}
```

**SCORING LOGIC:**
1. Each criterion has a weight (e.g., Price 40%, Technical 40%, Programme 20%)
2. Each submission gets scored per criterion (0-100)
3. Weighted average = overall score
4. Submissions ranked by overall score

---

### 6. AWARDS & CONTRACTS

#### Award (Model) - Award Decision
```prisma
model Award {
  id             Int
  tenantId       String
  projectId      Int → Project
  packageId      Int → Package ⭐
  supplierId     Int → Supplier

  awardValue     Decimal
  awardDate      DateTime
  overrideUsed   Boolean
  overrideReason String?

  // Relations
  project  Project
  package  Package
  supplier Supplier
  contract Contract? ← one-to-one with contract
}
```

#### AwardDecision (Model) - Approval Workflow
```prisma
model AwardDecision {
  id          Int
  projectId   Int → Project
  packageId   Int → Package
  supplierId  Int? → Supplier

  awardType   String // 'direct' | 'tender'
  decision    String // 'approved' | 'approved_with_override' | 'rejected'
  reason      String?
  decidedById Int?
  decidedAt   DateTime

  project  Project
  package  Package
  supplier Supplier?
}
```

#### Contract (Model) - Final Contract
```prisma
model Contract {
  id              Int
  projectId       Int → Project
  packageId       Int? → Package   ⭐
  supplierId      Int → Supplier
  rfxId           Int? → Rfx (optional)
  awardId         Int? → Award (optional)

  title           String
  contractRef     String?
  value           Decimal
  currency        String
  status          String  // "draft", "signed", "active"

  signedAt        DateTime?
  startDate       DateTime?
  endDate         DateTime?
  retentionPct    Decimal?
  paymentTerms    String?
  notes           String?

  // Relations
  project        Project
  package        Package?
  supplier       Supplier
  rfx            Rfx?
  award          Award?
  lineItems      ContractLineItem[]       ← contract BOQ
  documents      ContractDocument[]       ← contract documents
  files          ContractFile[]           ← attachments
  approvalSteps  ContractApprovalStep[]   ← workflow
  approvals      ContractApproval[]       ← approval decisions
  applications   ApplicationForPayment[]  ← payment applications
  invoices       Invoice[]                ← invoices
  purchaseOrders PurchaseOrder[]          ← POs
}
```

#### ContractLineItem (Model) - Contract BOQ
```prisma
model ContractLineItem {
  id                Int
  contractId        Int → Contract
  packageLineItemId Int? → PackageLineItem (source)
  budgetLineId      Int? → BudgetLine (source)

  description   String
  qty           Decimal
  rate          Decimal
  total         Decimal
  costCode      String?

  // Relations
  contract        Contract
  packageLineItem PackageLineItem?
  budgetLine      BudgetLine?
}
```

#### ContractDocument (Model) - Editable Contracts
```prisma
model ContractDocument {
  id         Int
  tenantId   String
  contractId Int → Contract

  title      String
  editorType String  // 'prosemirror' | 'onlyoffice' | 'collabora'
  active     Boolean

  contract Contract
  versions ContractVersion[] ← version history
}
```

#### ContractVersion (Model) - Version Control
```prisma
model ContractVersion {
  id            Int
  tenantId      String
  contractDocId Int → ContractDocument

  versionNo     Int
  contentJson   Json       // document content
  baseVersionId Int?       // for diff/redline
  redlinePatch  Json?      // changes from base
  createdBy     Int?
  createdAt     DateTime
}
```

---

## 🔗 COMPLETE WORKFLOW MAPPING

### WORKFLOW: Budget → Package → Tender → Submission → Award → Contract

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: BUDGET STRUCTURE                                        │
└─────────────────────────────────────────────────────────────────┘

Project
  ├─ CostCode (01 - Preliminaries)
  │  └─ BudgetLine (01.001, 01.002, ...)
  ├─ CostCode (02 - Substructure)
  │  └─ BudgetLine (02.001, 02.002, 02.003, ...)
  └─ CostCode (03 - Frame)
     └─ BudgetLine (03.001, 03.002, ...)

┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: PACKAGE CREATION & BUDGET LINKING                       │
└─────────────────────────────────────────────────────────────────┘

Package (Groundworks)
  ├─ packageId: 1
  ├─ projectId: 1
  ├─ costCodeId: 2 (optional direct link)
  └─ PackageItem[] ⭐ CRITICAL LINKS:
     ├─ PackageItem { packageId: 1, budgetLineId: 5 }  (02.001)
     ├─ PackageItem { packageId: 1, budgetLineId: 6 }  (02.002)
     ├─ PackageItem { packageId: 1, budgetLineId: 7 }  (02.003)
     └─ PackageItem { packageId: 1, budgetLineId: 8 }  (02.004)

Package also has:
  └─ PackageLineItem[] (BOQ snapshot for tendering)
     ├─ Line 1: "Excavation to reduced level" - 1000m³ @ £45
     ├─ Line 2: "Disposal of excavated material" - 1000m³ @ £15
     ├─ Line 3: "Blinding layer" - 250m² @ £25
     └─ Line 4: "Formwork to foundations" - 300m² @ £55

┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: TENDER CREATION FROM PACKAGE                            │
└─────────────────────────────────────────────────────────────────┘

Tender
  ├─ tenderId: 1
  ├─ projectId: 1
  ├─ packageId: 1 ⭐
  ├─ title: "Tender for Groundworks Package"
  ├─ status: "issued"
  │
  ├─ TenderSection[] (organize questions)
  │  ├─ Section 1: "Company Information" (weight 10%)
  │  ├─ Section 2: "Experience & Qualifications" (weight 20%)
  │  ├─ Section 3: "Technical Approach" (weight 30%)
  │  ├─ Section 4: "Health & Safety" (weight 15%)
  │  └─ Section 5: "Programme & Resources" (weight 25%)
  │
  └─ TenderQuestion[] ⭐ MUST CREATE QUESTIONS:
     ├─ Q1: "Company registration number" (type: text, weight: 0) [informational]
     ├─ Q2: "Years trading?" (type: number, weight: 5)
     ├─ Q3: "Number of employees?" (type: number, weight: 5)
     ├─ Q4: "List similar projects completed" (type: textarea, weight: 10)
     ├─ Q5: "Relevant accreditations?" (type: multi, weight: 10)
     ├─ Q6: "Technical approach to excavation" (type: textarea, weight: 15)
     ├─ Q7: "Proposed methodology" (type: textarea, weight: 15)
     ├─ Q8: "H&S policy and procedures" (type: file, weight: 5)
     ├─ Q9: "RIDDOR incidents in last 3 years" (type: number, weight: 5)
     ├─ Q10: "Programme duration (weeks)" (type: number, weight: 15)
     ├─ Q11: "Key personnel CVs" (type: file, weight: 5)
     └─ Q12: "Plant and equipment list" (type: file, weight: 5)

Supplier Invitations:
  ├─ TenderSupplierInvite { tenderId: 1, supplierId: 5, token: "abc123..." }
  ├─ TenderSupplierInvite { tenderId: 1, supplierId: 8, token: "def456..." }
  └─ TenderSupplierInvite { tenderId: 1, supplierId: 12, token: "ghi789..." }

┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: SUPPLIER SUBMISSIONS                                    │
└─────────────────────────────────────────────────────────────────┘

TenderSubmission (Supplier 5 - Thames Valley Groundworks)
  ├─ submissionId: 1
  ├─ tenderId: 1
  ├─ supplierId: 5
  ├─ totalPrice: £185,000
  ├─ status: "submitted"
  │
  └─ TenderSubmissionItem[] (if using simple model):
     ├─ Item 1: "Groundworks package" - £185,000
     └─ (or detailed breakdown if MEASURED pricing)

PackageResponse (Supplier 5 - Detailed)
  ├─ packageResponseId: 1
  ├─ packageId: 1
  ├─ tenderResponseId: 1
  ├─ supplierId: 5
  ├─ pricingType: "HYBRID_WITH_BREAKDOWN"
  ├─ packageTotal: £185,000
  ├─ preliminaries: £15,000
  ├─ programmeDuration: 12 (weeks)
  ├─ technicalCompliance: true
  │
  └─ SupplierLinePrice[] ⭐ ANSWER EVERY BOQ LINE:
     ├─ Line 1: rate £42.50/m³, total £42,500 (qty 1000)
     ├─ Line 2: rate £14.00/m³, total £14,000 (qty 1000)
     ├─ Line 3: rate £23.50/m², total £5,875  (qty 250)
     └─ Line 4: rate £52.00/m², total £15,600 (qty 300)

Question Answers (in TenderResponse.answers JSON):
  {
    "q1": "GB12345678",
    "q2": 15,
    "q3": 45,
    "q4": "1. Hospital Car Park - £2.5M - 2023\n2. School Extension - £1.8M - 2022",
    "q5": ["ISO9001", "ISO14001", "Constructionline"],
    "q6": "We propose phased excavation using 360 excavators...",
    "q7": "Our methodology includes: 1) Site survey 2) Sequencing...",
    "q8": { "fileId": "doc_123", "filename": "H&S_Policy.pdf" },
    "q9": 0,
    "q10": 12,
    "q11": { "fileId": "doc_124", "filename": "CVs.pdf" },
    "q12": { "fileId": "doc_125", "filename": "Plant_List.xlsx" }
  }

Repeat for Supplier 8 and Supplier 12...

┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: EVALUATION & SCORING                                    │
└─────────────────────────────────────────────────────────────────┘

TenderCriteria (set up evaluation criteria):
  ├─ Criteria 1: "Price" (type: price, weight: 40%)
  ├─ Criteria 2: "Technical Quality" (type: technical, weight: 30%)
  ├─ Criteria 3: "Programme" (type: programme, weight: 15%)
  └─ Criteria 4: "Health & Safety" (type: h&s, weight: 15%)

TenderScore (per submission, per criterion):
  Submission 1 (Supplier 5):
  ├─ Price Score: 100 (lowest price)
  ├─ Technical Score: 92
  ├─ Programme Score: 95
  └─ H&S Score: 90
  → Weighted Total: (100×0.4) + (92×0.3) + (95×0.15) + (90×0.15) = 95.35
  → Rank: 1

  Submission 2 (Supplier 8):
  ├─ Price Score: 85
  ├─ Technical Score: 88
  ├─ Programme Score: 80
  └─ H&S Score: 85
  → Weighted Total: 84.75
  → Rank: 2

  Submission 3 (Supplier 12):
  ├─ Price Score: 75
  ├─ Technical Score: 80
  ├─ Programme Score: 75
  └─ H&S Score: 80
  → Weighted Total: 77.75
  → Rank: 3

┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: AWARD DECISION                                          │
└─────────────────────────────────────────────────────────────────┘

AwardDecision
  ├─ projectId: 1
  ├─ packageId: 1
  ├─ supplierId: 5 (Supplier 5 - Rank 1 winner)
  ├─ awardType: "tender"
  ├─ decision: "approved"
  ├─ reason: "Highest overall score with best price"
  └─ decidedAt: 2024-11-01

Award
  ├─ awardId: 1
  ├─ projectId: 1
  ├─ packageId: 1
  ├─ supplierId: 5
  ├─ awardValue: £185,000
  └─ awardDate: 2024-11-01

Update Tender:
  └─ status: "awarded"

Update Package:
  ├─ awardSupplierId: 5
  ├─ awardedValue: £185,000
  └─ awardedAt: 2024-11-01

┌─────────────────────────────────────────────────────────────────┐
│ STEP 7: CONTRACT CREATION                                       │
└─────────────────────────────────────────────────────────────────┘

Contract
  ├─ contractId: 1
  ├─ projectId: 1
  ├─ packageId: 1 ⭐
  ├─ supplierId: 5
  ├─ awardId: 1 ⭐
  ├─ title: "Groundworks Contract - Thames Valley Groundworks"
  ├─ value: £185,000
  ├─ status: "signed"
  ├─ signedAt: 2024-11-15
  ├─ startDate: 2025-01-15
  ├─ endDate: 2025-04-15
  ├─ retentionPct: 5%
  ├─ paymentTerms: "Monthly valuations, 30 days net"
  │
  ├─ ContractLineItem[] (copied from PackageLineItem or SupplierLinePrice):
  │  ├─ Line 1: "Excavation" - 1000m³ @ £42.50 = £42,500
  │  ├─ Line 2: "Disposal" - 1000m³ @ £14.00 = £14,000
  │  ├─ Line 3: "Blinding" - 250m² @ £23.50 = £5,875
  │  └─ Line 4: "Formwork" - 300m² @ £52.00 = £15,600
  │
  └─ ContractDocument[] (signed documents):
     ├─ Doc 1: "Main Contract Agreement" (signed, v1.0)
     ├─ Doc 2: "Performance Bond (10%)" (signed)
     ├─ Doc 3: "Insurance Certificate - £10M Liability" (signed)
     ├─ Doc 4: "Programme Baseline" (signed)
     ├─ Doc 5: "H&S Plan" (signed)
     └─ Doc 6: "Quality Plan" (signed)
```

---

## 🔍 KEY RELATIONSHIP MAPPING

### Primary Foreign Keys

```
BudgetLine → Project (projectId)
BudgetLine → CostCode (costCodeId, optional)
BudgetLine → BudgetGroup (groupId, optional)

PackageItem → Package (packageId) ⭐
PackageItem → BudgetLine (budgetLineId) ⭐
  ↑ THIS IS THE CRITICAL LINK

Package → Project (projectId)
Package → CostCode (costCodeId, optional)

PackageLineItem → Package (packageId)

Tender → Project (projectId)
Tender → Package (packageId) ⭐

TenderQuestion → Tender (tenderId)
TenderQuestion → TenderSection (sectionId, optional)

TenderSubmission → Tender (tenderId)
TenderSubmission → Supplier (supplierId)

PackageResponse → Package (packageId) ⭐
PackageResponse → TenderResponse (tenderResponseId)
PackageResponse → Supplier (supplierId)

SupplierLinePrice → PackageResponse (packageResponseId)
SupplierLinePrice → PackageLineItem (lineItemId)

TenderScore → TenderCriteria (criteriaId)
TenderScore → TenderSubmission (submissionId)

Award → Project (projectId)
Award → Package (packageId) ⭐
Award → Supplier (supplierId)

Contract → Project (projectId)
Contract → Package (packageId) ⭐
Contract → Supplier (supplierId)
Contract → Award (awardId, optional)

ContractLineItem → Contract (contractId)
ContractLineItem → PackageLineItem (packageLineItemId, optional)
ContractLineItem → BudgetLine (budgetLineId, optional)

ContractDocument → Contract (contractId)

ContractVersion → ContractDocument (contractDocId)
```

---

## ✅ SEED ORDER (Respecting FK Dependencies)

```
1.  User               (no dependencies)
2.  Role               (no dependencies)
3.  Permission         (no dependencies)
4.  UserRole           (User, Role)
5.  RolePermission     (Role, Permission)
6.  Client             (no dependencies)
7.  Supplier           (no dependencies)
8.  SupplierCapability (Supplier)
9.  Project            (Client)
10. ProjectMembership  (Project, User)
11. CostCode           (optional - can self-reference parent)
12. BudgetGroup        (Project)
13. BudgetLine         (Project, CostCode?, BudgetGroup?)
14. Package            (Project, CostCode?)
15. PackageItem        (Package, BudgetLine) ⭐ CRITICAL
16. PackageLineItem    (Package)
17. Tender             (Project, Package)
18. TenderSection      (Tender)
19. TenderQuestion     (Tender, TenderSection?)
20. TenderSupplierInvite (Tender, Supplier)
21. TenderResponse     (Tender, Supplier)
22. PackageResponse    (Package, TenderResponse, Supplier)
23. SupplierLinePrice  (PackageResponse, PackageLineItem)
24. TenderCriteria     (Tender)
25. TenderSubmission   (Tender, Supplier)
26. TenderScore        (TenderCriteria, TenderSubmission)
27. AwardDecision      (Project, Package, Supplier)
28. Award              (Project, Package, Supplier)
29. Contract           (Project, Package, Supplier, Award?)
30. ContractLineItem   (Contract, PackageLineItem?, BudgetLine?)
31. ContractDocument   (Contract)
32. ContractVersion    (ContractDocument)
33. ContractFile       (Contract)
```

---

## 📋 CRITICAL CHECKS FOR SEED VERIFICATION

### 1. Budget → Package Links
```sql
-- Every package should link to 3-8 budget lines
SELECT
  p.id,
  p.name,
  COUNT(pi.id) as budget_line_count
FROM "Package" p
LEFT JOIN "PackageItem" pi ON p.id = pi."packageId"
GROUP BY p.id, p.name
HAVING COUNT(pi.id) = 0;
-- Should return 0 rows (no packages without budget links)
```

### 2. Tender → Questions
```sql
-- Every tender should have 8-15 questions
SELECT
  t.id,
  t.title,
  COUNT(tq.id) as question_count
FROM "Tender" t
LEFT JOIN "TenderQuestion" tq ON t.id = tq."tenderId"
GROUP BY t.id, t.title
HAVING COUNT(tq.id) < 8;
-- Should return 0 rows
```

### 3. Submission → Answers
```sql
-- Every PackageResponse should have pricing for all line items (if HYBRID/ITEMIZED)
SELECT
  pr.id,
  pr."pricingType",
  COUNT(DISTINCT pli.id) as total_lines,
  COUNT(DISTINCT slp.id) as priced_lines
FROM "PackageResponse" pr
JOIN "Package" p ON pr."packageId" = p.id
JOIN "PackageLineItem" pli ON p.id = pli."packageId"
LEFT JOIN "SupplierLinePrice" slp ON pr.id = slp."packageResponseId" AND pli.id = slp."lineItemId"
WHERE pr."pricingType" IN ('ITEMIZED_ONLY', 'HYBRID_WITH_BREAKDOWN')
GROUP BY pr.id, pr."pricingType"
HAVING COUNT(DISTINCT pli.id) != COUNT(DISTINCT slp.id);
-- Should return 0 rows (all lines priced)
```

### 4. Scoring Complete
```sql
-- Every submission should have scores for all criteria
SELECT
  ts.id,
  COUNT(DISTINCT tc.id) as total_criteria,
  COUNT(DISTINCT tsc.id) as scored_criteria
FROM "TenderSubmission" ts
CROSS JOIN "TenderCriteria" tc
LEFT JOIN "TenderScore" tsc ON ts.id = tsc."submissionId" AND tc.id = tsc."criteriaId"
WHERE tc."tenderId" = ts."tenderId"
GROUP BY ts.id
HAVING COUNT(DISTINCT tc.id) != COUNT(DISTINCT tsc.id);
-- Should return 0 rows (all submissions fully scored)
```

### 5. Contract → Package Link
```sql
-- Every awarded tender should have a contract
SELECT
  t.id,
  t.title,
  t.status,
  c.id as contract_id
FROM "Tender" t
LEFT JOIN "Contract" c ON t."packageId" = c."packageId"
WHERE t.status = 'awarded' AND c.id IS NULL;
-- Should return 0 rows
```

---

## 🎯 SUMMARY

**Total Models Analyzed:** 136
**Critical Workflow Models:** 30
**Join Tables:** 3 (PackageItem ⭐, PackageResponse, SupplierLinePrice)

**Key Success Metrics:**
- ✅ All packages linked to budget lines (via PackageItem)
- ✅ All tenders have questions (8-15 per tender)
- ✅ All submissions have complete answers
- ✅ All submissions scored and ranked
- ✅ Awarded tenders have contracts
- ✅ Contracts have signed documents
- ✅ Complete traceability: Budget Line → Package → Tender → Submission → Contract

---

*Report Generated: 2025-11-02*
