export type ProgressStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed_once'
  | 'revised'
  | 'mastered'
  | 'flagged'

export type SyllabusSubject = {
  id: string
  title: string
  weight: string
  topics: SyllabusTopic[]
}

export type SyllabusTopic = {
  id: string
  subjectId: string
  title: string
  priorityWeight: number
  subtopics: SyllabusSubtopic[]
}

export type SyllabusSubtopic = {
  id: string
  topicId: string
  title: string
  timeEstimateMinutes: number
  legacyIds: string[]
}

type ModuleEmphasis = 'formula' | 'concept' | 'application' | 'ethics'

type ModuleDefinition = {
  id: string
  title: string
  emphasis: ModuleEmphasis
  priorityWeight?: number
  timeEstimateMinutes?: number
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getPrimarySubtopicSuffix(emphasis: ModuleEmphasis) {
  return emphasis === 'formula' || emphasis === 'application' ? 'concepts' : 'reading'
}

function getLegacySubtopicSuffixes(emphasis: ModuleEmphasis) {
  return {
    ethics: ['reading', 'cases', 'review'],
    formula: ['concepts', 'calculator', 'questions'],
    application: ['concepts', 'cases', 'questions'],
    concept: ['reading', 'recall', 'questions'],
  }[emphasis]
}

function buildSubtopics(topicId: string, title: string, emphasis: ModuleEmphasis, baseMinutes = 55): SyllabusSubtopic[] {
  const safeTitle = title.replace(/\s+/g, ' ').trim()
  const primarySuffix = getPrimarySubtopicSuffix(emphasis)

  return [
    {
      id: `${topicId}-${primarySuffix}`,
      topicId,
      title: safeTitle,
      timeEstimateMinutes: Math.max(35, baseMinutes),
      legacyIds: [topicId, ...getLegacySubtopicSuffixes(emphasis).map((suffix) => `${topicId}-${suffix}`)],
    },
  ]
}

function buildSubject(subject: {
  id: string
  title: string
  weight: string
  modules: ModuleDefinition[]
}): SyllabusSubject {
  return {
    id: subject.id,
    title: subject.title,
    weight: subject.weight,
    topics: subject.modules.map((module, index) => {
      const topicId = `${subject.id}-${module.id || slugify(module.title)}`
      return {
        id: topicId,
        subjectId: subject.id,
        title: module.title,
        priorityWeight: module.priorityWeight ?? (index < 3 ? 1.3 : index < 6 ? 1.15 : 1),
        subtopics: buildSubtopics(topicId, module.title, module.emphasis, module.timeEstimateMinutes),
      }
    }),
  }
}

export const cfaLevel1Syllabus: SyllabusSubject[] = [
  buildSubject({
    id: 'ethics',
    title: 'Ethical and Professional Standards',
    weight: '15-20%',
    modules: [
      { id: 'trust', title: 'Ethics and Trust in the Investment Profession', emphasis: 'ethics', priorityWeight: 1.45, timeEstimateMinutes: 55 },
      { id: 'code-and-standards', title: 'Code of Ethics and Standards of Professional Conduct', emphasis: 'ethics', priorityWeight: 1.5, timeEstimateMinutes: 60 },
      { id: 'guidance', title: 'Guidance for Standards I-VII', emphasis: 'ethics', priorityWeight: 1.55, timeEstimateMinutes: 70 },
      { id: 'gips', title: 'Introduction to the Global Investment Performance Standards (GIPS)', emphasis: 'concept', priorityWeight: 1.1, timeEstimateMinutes: 45 },
      { id: 'application', title: 'Ethics Application', emphasis: 'ethics', priorityWeight: 1.6, timeEstimateMinutes: 65 },
    ],
  }),
  buildSubject({
    id: 'quant',
    title: 'Quantitative Methods',
    weight: '6-9%',
    modules: [
      { id: 'rates-and-returns', title: 'Rates and Returns', emphasis: 'formula', priorityWeight: 1.3 },
      { id: 'tvm', title: 'Time Value of Money in Finance', emphasis: 'formula', priorityWeight: 1.35 },
      { id: 'stats', title: 'Statistical Measures of Asset Returns', emphasis: 'formula', priorityWeight: 1.25 },
      { id: 'probability', title: 'Probability Trees and Conditional Expectations', emphasis: 'formula', priorityWeight: 1.2 },
      { id: 'portfolio-math', title: 'Portfolio Mathematics', emphasis: 'formula', priorityWeight: 1.2 },
      { id: 'simulation', title: 'Simulation Methods', emphasis: 'concept', priorityWeight: 1.05 },
      { id: 'estimation', title: 'Estimation and Inference', emphasis: 'formula', priorityWeight: 1.15 },
      { id: 'hypothesis-testing', title: 'Hypothesis Testing', emphasis: 'formula', priorityWeight: 1.2 },
      { id: 'independence-tests', title: 'Parametric and Non-Parametric Tests of Independence', emphasis: 'formula', priorityWeight: 1.05 },
      { id: 'linear-regression', title: 'Simple Linear Regression', emphasis: 'formula', priorityWeight: 1.25 },
      { id: 'big-data', title: 'Introduction to Big Data Techniques', emphasis: 'concept', priorityWeight: 0.9 },
    ],
  }),
  buildSubject({
    id: 'economics',
    title: 'Economics',
    weight: '6-9%',
    modules: [
      { id: 'firm-and-markets', title: 'The Firm and Market Structures', emphasis: 'concept', priorityWeight: 1.1 },
      { id: 'business-cycles', title: 'Understanding Business Cycles', emphasis: 'concept', priorityWeight: 1.05 },
      { id: 'fiscal-policy', title: 'Fiscal Policy', emphasis: 'formula', priorityWeight: 1 },
      { id: 'monetary-policy', title: 'Monetary Policy', emphasis: 'concept', priorityWeight: 1 },
      { id: 'geopolitics', title: 'Introduction to Geopolitics', emphasis: 'concept', priorityWeight: 0.85 },
      { id: 'international-trade', title: 'International Trade', emphasis: 'concept', priorityWeight: 0.95 },
      { id: 'capital-flows-fx', title: 'Capital Flows and the FX Market', emphasis: 'formula', priorityWeight: 1.1 },
      { id: 'fx-calculations', title: 'Exchange Rate Calculations', emphasis: 'formula', priorityWeight: 1.15 },
    ],
  }),
  buildSubject({
    id: 'corporate-issuers',
    title: 'Corporate Issuers',
    weight: '6-9%',
    modules: [
      { id: 'org-forms', title: 'Organizational Forms, Corporate Issuer Features, and Ownership', emphasis: 'concept', priorityWeight: 0.95 },
      { id: 'stakeholders', title: 'Investors and Other Stakeholders', emphasis: 'concept', priorityWeight: 0.9 },
      { id: 'governance', title: 'Corporate Governance: Conflicts, Mechanisms, Risks, and Benefits', emphasis: 'application', priorityWeight: 1.05 },
      { id: 'working-capital', title: 'Working Capital and Liquidity', emphasis: 'formula', priorityWeight: 1.1 },
      { id: 'capital-investments', title: 'Capital Investments and Capital Allocation', emphasis: 'formula', priorityWeight: 1.25 },
      { id: 'capital-structure', title: 'Capital Structure', emphasis: 'formula', priorityWeight: 1.15 },
      { id: 'business-models', title: 'Business Models', emphasis: 'concept', priorityWeight: 0.95 },
    ],
  }),
  buildSubject({
    id: 'financial-statement-analysis',
    title: 'Financial Statement Analysis',
    weight: '11-14%',
    modules: [
      { id: 'intro', title: 'Introduction to Financial Statement Analysis', emphasis: 'concept', priorityWeight: 1.15 },
      { id: 'income-statements', title: 'Analyzing Income Statements', emphasis: 'formula', priorityWeight: 1.35 },
      { id: 'balance-sheets', title: 'Analyzing Balance Sheets', emphasis: 'formula', priorityWeight: 1.3 },
      { id: 'cash-flows-1', title: 'Analyzing Statements of Cash Flows I', emphasis: 'formula', priorityWeight: 1.3 },
      { id: 'cash-flows-2', title: 'Analyzing Statements of Cash Flows II', emphasis: 'formula', priorityWeight: 1.3 },
      { id: 'inventories', title: 'Analysis of Inventories', emphasis: 'formula', priorityWeight: 1.25 },
      { id: 'long-term-assets', title: 'Analysis of Long-Term Assets', emphasis: 'formula', priorityWeight: 1.25 },
      { id: 'liabilities-equity', title: 'Topics in Long-Term Liabilities and Equity', emphasis: 'formula', priorityWeight: 1.2 },
      { id: 'income-taxes', title: 'Analysis of Income Taxes', emphasis: 'formula', priorityWeight: 1.2 },
      { id: 'reporting-quality', title: 'Financial Reporting Quality', emphasis: 'application', priorityWeight: 1.15 },
      { id: 'analysis-techniques', title: 'Financial Analysis Techniques', emphasis: 'formula', priorityWeight: 1.35 },
      { id: 'modeling', title: 'Introduction to Financial Statement Modeling', emphasis: 'application', priorityWeight: 1.05 },
    ],
  }),
  buildSubject({
    id: 'equity',
    title: 'Equity Investments',
    weight: '11-14%',
    modules: [
      { id: 'market-organization', title: 'Market Organization and Structure', emphasis: 'concept', priorityWeight: 1.05 },
      { id: 'indexes', title: 'Security Market Indexes', emphasis: 'formula', priorityWeight: 1.1 },
      { id: 'market-efficiency', title: 'Market Efficiency', emphasis: 'concept', priorityWeight: 1.05 },
      { id: 'equity-securities', title: 'Overview of Equity Securities', emphasis: 'concept', priorityWeight: 1.05 },
      { id: 'company-analysis-past', title: 'Company Analysis: Past and Present', emphasis: 'application', priorityWeight: 1.1 },
      { id: 'industry-analysis', title: 'Industry and Competitive Analysis', emphasis: 'application', priorityWeight: 1.1 },
      { id: 'company-forecasting', title: 'Company Analysis: Forecasting', emphasis: 'formula', priorityWeight: 1.2 },
      { id: 'equity-valuation', title: 'Equity Valuation: Concepts and Basic Tools', emphasis: 'formula', priorityWeight: 1.3 },
    ],
  }),
  buildSubject({
    id: 'fixed-income',
    title: 'Fixed Income',
    weight: '11-14%',
    modules: [
      { id: 'instrument-features', title: 'Fixed-Income Instrument Features', emphasis: 'concept', priorityWeight: 1.05 },
      { id: 'cash-flows-types', title: 'Fixed-Income Cash Flows and Types', emphasis: 'concept', priorityWeight: 1.05 },
      { id: 'issuance-trading', title: 'Fixed-Income Issuance and Trading', emphasis: 'concept', priorityWeight: 1.05 },
      { id: 'corporate-markets', title: 'Fixed-Income Markets for Corporate Issuers', emphasis: 'concept', priorityWeight: 1.05 },
      { id: 'government-markets', title: 'Fixed-Income Markets for Government Issuers', emphasis: 'concept', priorityWeight: 1.05 },
      { id: 'bond-valuation', title: 'Fixed-Income Bond Valuation: Prices and Yields', emphasis: 'formula', priorityWeight: 1.35 },
      { id: 'yield-spreads-fixed', title: 'Yield and Yield Spread Measures for Fixed-Rate Bonds', emphasis: 'formula', priorityWeight: 1.3 },
      { id: 'yield-spreads-floating', title: 'Yield and Yield Spread Measures for Floating-Rate Instruments', emphasis: 'formula', priorityWeight: 1.2 },
      { id: 'term-structure', title: 'The Term Structure of Interest Rates: Spot, Par, and Forward Curves', emphasis: 'formula', priorityWeight: 1.3 },
      { id: 'interest-rate-risk', title: 'Interest Rate Risk and Return', emphasis: 'formula', priorityWeight: 1.2 },
      { id: 'duration', title: 'Yield-Based Bond Duration Measures and Properties', emphasis: 'formula', priorityWeight: 1.35 },
      { id: 'convexity', title: 'Yield-Based Bond Convexity and Portfolio Properties', emphasis: 'formula', priorityWeight: 1.3 },
      { id: 'curve-risk', title: 'Curve-Based and Empirical Fixed-Income Risk Measures', emphasis: 'formula', priorityWeight: 1.15 },
      { id: 'credit-risk', title: 'Credit Risk', emphasis: 'concept', priorityWeight: 1.1 },
      { id: 'government-credit', title: 'Credit Analysis for Government Issuers', emphasis: 'application', priorityWeight: 1.05 },
      { id: 'corporate-credit', title: 'Credit Analysis for Corporate Issuers', emphasis: 'application', priorityWeight: 1.1 },
      { id: 'securitization', title: 'Fixed-Income Securitization', emphasis: 'concept', priorityWeight: 1.05 },
      { id: 'abs', title: 'Asset-Backed Security (ABS) Instrument and Market Features', emphasis: 'concept', priorityWeight: 1 },
      { id: 'mbs', title: 'Mortgage-Backed Security (MBS) Instrument and Market Features', emphasis: 'concept', priorityWeight: 1 },
    ],
  }),
  buildSubject({
    id: 'derivatives',
    title: 'Derivatives',
    weight: '5-8%',
    modules: [
      { id: 'instrument-features', title: 'Derivative Instrument and Derivative Market Features', emphasis: 'concept', priorityWeight: 1 },
      { id: 'instruments', title: 'Forward Commitment and Contingent Claim Features and Instruments', emphasis: 'concept', priorityWeight: 1.1 },
      { id: 'benefits-risks', title: 'Derivative Benefits, Risks, and Issuer and Investor Uses', emphasis: 'application', priorityWeight: 0.95 },
      { id: 'cost-of-carry', title: 'Arbitrage, Replication, and the Cost of Carry in Pricing Derivatives', emphasis: 'formula', priorityWeight: 1.25 },
      { id: 'forwards', title: 'Pricing and Valuation of Forward Contracts and for an Underlying with Varying Maturities', emphasis: 'formula', priorityWeight: 1.2 },
      { id: 'futures', title: 'Pricing and Valuation of Futures Contracts', emphasis: 'formula', priorityWeight: 1.2 },
      { id: 'swaps', title: 'Pricing and Valuation of Interest Rates and Other Swaps', emphasis: 'formula', priorityWeight: 1.2 },
      { id: 'options', title: 'Pricing and Valuation of Options', emphasis: 'formula', priorityWeight: 1.3 },
      { id: 'put-call-parity', title: 'Option Replication Using Put-Call Parity', emphasis: 'formula', priorityWeight: 1.3 },
      { id: 'binomial-model', title: 'Valuing a Derivative Using a One-Period Binomial Model', emphasis: 'formula', priorityWeight: 1.2 },
    ],
  }),
  buildSubject({
    id: 'alternative-investments',
    title: 'Alternative Investments',
    weight: '7-10%',
    modules: [
      { id: 'features-methods', title: 'Alternative Investment Features, Methods, and Structures', emphasis: 'concept', priorityWeight: 1 },
      { id: 'performance-returns', title: 'Alternative Investment Performance and Returns', emphasis: 'formula', priorityWeight: 1.1 },
      { id: 'private-capital', title: 'Investments in Private Capital: Equity and Debt', emphasis: 'concept', priorityWeight: 1 },
      { id: 'real-estate', title: 'Real Estate and Infrastructure', emphasis: 'application', priorityWeight: 1.05 },
      { id: 'natural-resources', title: 'Natural Resources', emphasis: 'concept', priorityWeight: 0.95 },
      { id: 'hedge-funds', title: 'Hedge Funds', emphasis: 'application', priorityWeight: 1 },
      { id: 'digital-assets', title: 'Introduction to Digital Assets', emphasis: 'concept', priorityWeight: 0.9 },
    ],
  }),
  buildSubject({
    id: 'portfolio',
    title: 'Portfolio Management',
    weight: '8-12%',
    modules: [
      { id: 'risk-return-1', title: 'Portfolio Risk and Return: Part I', emphasis: 'formula', priorityWeight: 1.25 },
      { id: 'risk-return-2', title: 'Portfolio Risk and Return: Part II', emphasis: 'formula', priorityWeight: 1.25 },
      { id: 'overview', title: 'Portfolio Management: An Overview', emphasis: 'concept', priorityWeight: 1.05 },
      { id: 'planning-construction', title: 'Basics of Portfolio Planning and Construction', emphasis: 'application', priorityWeight: 1.15 },
      { id: 'behavioral-biases', title: 'The Behavioral Biases of Individuals', emphasis: 'application', priorityWeight: 1 },
      { id: 'risk-management', title: 'Introduction to Risk Management', emphasis: 'concept', priorityWeight: 1.05 },
    ],
  }),
]

export const allSubtopics = cfaLevel1Syllabus.flatMap((subject) =>
  subject.topics.flatMap((topic) => topic.subtopics.map((subtopic) => ({ ...subtopic, topic, subject }))),
)

export const syllabusSubtopicIdAliases = Object.fromEntries(
  allSubtopics.flatMap((subtopic) => subtopic.legacyIds.map((legacyId) => [legacyId, subtopic.id])),
)
