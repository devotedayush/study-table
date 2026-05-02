with target_chapters(target_id, title) as (
  values
    ('ethics-trust-reading', 'Ethics and Trust in the Investment Profession'),
    ('ethics-code-and-standards-reading', 'Code of Ethics and Standards of Professional Conduct'),
    ('ethics-guidance-reading', 'Guidance for Standards I-VII'),
    ('ethics-gips-reading', 'Introduction to the Global Investment Performance Standards (GIPS)'),
    ('ethics-application-reading', 'Ethics Application'),
    ('quant-rates-and-returns-concepts', 'Rates and Returns'),
    ('quant-tvm-concepts', 'Time Value of Money in Finance'),
    ('quant-stats-concepts', 'Statistical Measures of Asset Returns'),
    ('quant-probability-concepts', 'Probability Trees and Conditional Expectations'),
    ('quant-portfolio-math-concepts', 'Portfolio Mathematics'),
    ('quant-simulation-reading', 'Simulation Methods'),
    ('quant-estimation-concepts', 'Estimation and Inference'),
    ('quant-hypothesis-testing-concepts', 'Hypothesis Testing'),
    ('quant-independence-tests-concepts', 'Parametric and Non-Parametric Tests of Independence'),
    ('quant-linear-regression-concepts', 'Simple Linear Regression'),
    ('quant-big-data-reading', 'Introduction to Big Data Techniques'),
    ('economics-firm-and-markets-reading', 'The Firm and Market Structures'),
    ('economics-business-cycles-reading', 'Understanding Business Cycles'),
    ('economics-fiscal-policy-concepts', 'Fiscal Policy'),
    ('economics-monetary-policy-reading', 'Monetary Policy'),
    ('economics-geopolitics-reading', 'Introduction to Geopolitics'),
    ('economics-international-trade-reading', 'International Trade'),
    ('economics-capital-flows-fx-concepts', 'Capital Flows and the FX Market'),
    ('economics-fx-calculations-concepts', 'Exchange Rate Calculations'),
    ('corporate-issuers-org-forms-reading', 'Organizational Forms, Corporate Issuer Features, and Ownership'),
    ('corporate-issuers-stakeholders-reading', 'Investors and Other Stakeholders'),
    ('corporate-issuers-governance-concepts', 'Corporate Governance: Conflicts, Mechanisms, Risks, and Benefits'),
    ('corporate-issuers-working-capital-concepts', 'Working Capital and Liquidity'),
    ('corporate-issuers-capital-investments-concepts', 'Capital Investments and Capital Allocation'),
    ('corporate-issuers-capital-structure-concepts', 'Capital Structure'),
    ('corporate-issuers-business-models-reading', 'Business Models'),
    ('financial-statement-analysis-intro-reading', 'Introduction to Financial Statement Analysis'),
    ('financial-statement-analysis-income-statements-concepts', 'Analyzing Income Statements'),
    ('financial-statement-analysis-balance-sheets-concepts', 'Analyzing Balance Sheets'),
    ('financial-statement-analysis-cash-flows-1-concepts', 'Analyzing Statements of Cash Flows I'),
    ('financial-statement-analysis-cash-flows-2-concepts', 'Analyzing Statements of Cash Flows II'),
    ('financial-statement-analysis-inventories-concepts', 'Analysis of Inventories'),
    ('financial-statement-analysis-long-term-assets-concepts', 'Analysis of Long-Term Assets'),
    ('financial-statement-analysis-liabilities-equity-concepts', 'Topics in Long-Term Liabilities and Equity'),
    ('financial-statement-analysis-income-taxes-concepts', 'Analysis of Income Taxes'),
    ('financial-statement-analysis-reporting-quality-concepts', 'Financial Reporting Quality'),
    ('financial-statement-analysis-analysis-techniques-concepts', 'Financial Analysis Techniques'),
    ('financial-statement-analysis-modeling-concepts', 'Introduction to Financial Statement Modeling'),
    ('equity-market-organization-reading', 'Market Organization and Structure'),
    ('equity-indexes-concepts', 'Security Market Indexes'),
    ('equity-market-efficiency-reading', 'Market Efficiency'),
    ('equity-equity-securities-reading', 'Overview of Equity Securities'),
    ('equity-company-analysis-past-concepts', 'Company Analysis: Past and Present'),
    ('equity-industry-analysis-concepts', 'Industry and Competitive Analysis'),
    ('equity-company-forecasting-concepts', 'Company Analysis: Forecasting'),
    ('equity-equity-valuation-concepts', 'Equity Valuation: Concepts and Basic Tools'),
    ('fixed-income-instrument-features-reading', 'Fixed-Income Instrument Features'),
    ('fixed-income-cash-flows-types-reading', 'Fixed-Income Cash Flows and Types'),
    ('fixed-income-issuance-trading-reading', 'Fixed-Income Issuance and Trading'),
    ('fixed-income-corporate-markets-reading', 'Fixed-Income Markets for Corporate Issuers'),
    ('fixed-income-government-markets-reading', 'Fixed-Income Markets for Government Issuers'),
    ('fixed-income-bond-valuation-concepts', 'Fixed-Income Bond Valuation: Prices and Yields'),
    ('fixed-income-yield-spreads-fixed-concepts', 'Yield and Yield Spread Measures for Fixed-Rate Bonds'),
    ('fixed-income-yield-spreads-floating-concepts', 'Yield and Yield Spread Measures for Floating-Rate Instruments'),
    ('fixed-income-term-structure-concepts', 'The Term Structure of Interest Rates: Spot, Par, and Forward Curves'),
    ('fixed-income-interest-rate-risk-concepts', 'Interest Rate Risk and Return'),
    ('fixed-income-duration-concepts', 'Yield-Based Bond Duration Measures and Properties'),
    ('fixed-income-convexity-concepts', 'Yield-Based Bond Convexity and Portfolio Properties'),
    ('fixed-income-curve-risk-concepts', 'Curve-Based and Empirical Fixed-Income Risk Measures'),
    ('fixed-income-credit-risk-reading', 'Credit Risk'),
    ('fixed-income-government-credit-concepts', 'Credit Analysis for Government Issuers'),
    ('fixed-income-corporate-credit-concepts', 'Credit Analysis for Corporate Issuers'),
    ('fixed-income-securitization-reading', 'Fixed-Income Securitization'),
    ('fixed-income-abs-reading', 'Asset-Backed Security (ABS) Instrument and Market Features'),
    ('fixed-income-mbs-reading', 'Mortgage-Backed Security (MBS) Instrument and Market Features'),
    ('derivatives-instrument-features-reading', 'Derivative Instrument and Derivative Market Features'),
    ('derivatives-instruments-reading', 'Forward Commitment and Contingent Claim Features and Instruments'),
    ('derivatives-benefits-risks-concepts', 'Derivative Benefits, Risks, and Issuer and Investor Uses'),
    ('derivatives-cost-of-carry-concepts', 'Arbitrage, Replication, and the Cost of Carry in Pricing Derivatives'),
    ('derivatives-forwards-concepts', 'Pricing and Valuation of Forward Contracts and for an Underlying with Varying Maturities'),
    ('derivatives-futures-concepts', 'Pricing and Valuation of Futures Contracts'),
    ('derivatives-swaps-concepts', 'Pricing and Valuation of Interest Rates and Other Swaps'),
    ('derivatives-options-concepts', 'Pricing and Valuation of Options'),
    ('derivatives-put-call-parity-concepts', 'Option Replication Using Put-Call Parity'),
    ('derivatives-binomial-model-concepts', 'Valuing a Derivative Using a One-Period Binomial Model'),
    ('alternative-investments-features-methods-reading', 'Alternative Investment Features, Methods, and Structures'),
    ('alternative-investments-performance-returns-concepts', 'Alternative Investment Performance and Returns'),
    ('alternative-investments-private-capital-reading', 'Investments in Private Capital: Equity and Debt'),
    ('alternative-investments-real-estate-concepts', 'Real Estate and Infrastructure'),
    ('alternative-investments-natural-resources-reading', 'Natural Resources'),
    ('alternative-investments-hedge-funds-concepts', 'Hedge Funds'),
    ('alternative-investments-digital-assets-reading', 'Introduction to Digital Assets'),
    ('portfolio-risk-return-1-concepts', 'Portfolio Risk and Return: Part I'),
    ('portfolio-risk-return-2-concepts', 'Portfolio Risk and Return: Part II'),
    ('portfolio-overview-reading', 'Portfolio Management: An Overview'),
    ('portfolio-planning-construction-concepts', 'Basics of Portfolio Planning and Construction'),
    ('portfolio-behavioral-biases-concepts', 'The Behavioral Biases of Individuals'),
    ('portfolio-risk-management-reading', 'Introduction to Risk Management')
), aliases as (
  select target_id, title, target_id as old_id from target_chapters
  union all select target_id, title, regexp_replace(target_id, '-(reading|concepts)$', '') from target_chapters
  union all select target_id, title, regexp_replace(target_id, '-(reading|concepts)$', '') || '-reading' from target_chapters
  union all select target_id, title, regexp_replace(target_id, '-(reading|concepts)$', '') || '-concepts' from target_chapters
  union all select target_id, title, regexp_replace(target_id, '-(reading|concepts)$', '') || '-cases' from target_chapters
  union all select target_id, title, regexp_replace(target_id, '-(reading|concepts)$', '') || '-review' from target_chapters
  union all select target_id, title, regexp_replace(target_id, '-(reading|concepts)$', '') || '-calculator' from target_chapters
  union all select target_id, title, regexp_replace(target_id, '-(reading|concepts)$', '') || '-questions' from target_chapters
  union all select target_id, title, regexp_replace(target_id, '-(reading|concepts)$', '') || '-recall' from target_chapters
), dedup_aliases as (
  select distinct old_id, target_id, title from aliases
), matched_progress as materialized (
  select p.*, a.target_id
  from public.study_progress p
  join dedup_aliases a on a.old_id = p.subtopic_id
), progress_notes as (
  select user_id, target_id, string_agg(note, E'\n\n' order by note) as notes
  from (
    select distinct user_id, target_id, nullif(btrim(notes), '') as note
    from matched_progress
  ) n
  where note is not null
  group by user_id, target_id
), merged_progress as (
  select
    p.user_id,
    p.target_id as subtopic_id,
    (array_agg(p.status order by case p.status when 'mastered' then 5 when 'revised' then 4 when 'completed_once' then 3 when 'flagged' then 2 when 'in_progress' then 1 else 0 end desc, p.updated_at desc nulls last))[1] as status,
    max(greatest(
      coalesce(p.completion_percentage, 0),
      case p.status when 'mastered' then 100 when 'revised' then 100 when 'completed_once' then 100 when 'flagged' then 35 when 'in_progress' then 35 else 0 end
    ))::integer as completion_percentage,
    sum(coalesce(p.minutes_spent, 0))::integer as minutes_spent,
    max(p.self_confidence) as self_confidence,
    max(p.ai_mastery) as ai_mastery,
    coalesce(n.notes, '') as notes,
    (array_agg(p.difficulty order by case p.difficulty when 'hard' then 3 when 'medium' then 2 when 'easy' then 1 else 0 end desc nulls last))[1] as difficulty,
    max(p.last_studied_at) as last_studied_at,
    min(p.first_completed_at) filter (where p.first_completed_at is not null) as first_completed_at,
    min(p.revision_due_at) filter (where p.revision_due_at is not null) as revision_due_at,
    max(coalesce(p.revision_count, 0))::integer as revision_count,
    min(p.created_at) as created_at,
    now() as updated_at
  from matched_progress p
  left join progress_notes n on n.user_id = p.user_id and n.target_id = p.target_id
  group by p.user_id, p.target_id, n.notes
), deleted_progress as (
  delete from public.study_progress p
  using dedup_aliases a
  where p.subtopic_id = a.old_id
  returning p.user_id, p.subtopic_id
), inserted_progress as (
  insert into public.study_progress (
    user_id, subtopic_id, status, completion_percentage, minutes_spent, self_confidence, ai_mastery, notes, difficulty,
    last_studied_at, first_completed_at, revision_due_at, revision_count, created_at, updated_at
  )
  select user_id, subtopic_id, status, completion_percentage, minutes_spent, self_confidence, ai_mastery, notes, difficulty,
    last_studied_at, first_completed_at, revision_due_at, revision_count, created_at, updated_at
  from merged_progress
  on conflict (user_id, subtopic_id) do update set
    status = excluded.status,
    completion_percentage = excluded.completion_percentage,
    minutes_spent = excluded.minutes_spent,
    self_confidence = excluded.self_confidence,
    ai_mastery = excluded.ai_mastery,
    notes = excluded.notes,
    difficulty = excluded.difficulty,
    last_studied_at = excluded.last_studied_at,
    first_completed_at = excluded.first_completed_at,
    revision_due_at = excluded.revision_due_at,
    revision_count = excluded.revision_count,
    updated_at = excluded.updated_at
  returning user_id, subtopic_id
), updated_assessments as (
  update public.study_assessments sa
  set subtopic_id = a.target_id
  from dedup_aliases a
  where sa.subtopic_id = a.old_id
    and sa.subtopic_id <> a.target_id
  returning sa.id
), updated_question_attempts as (
  update public.study_question_attempts qa
  set subtopic_id = a.target_id,
      subtopic = a.title
  from dedup_aliases a
  where qa.subtopic_id = a.old_id
    and qa.subtopic_id <> a.target_id
  returning qa.id
), updated_assessment_sets as (
  update public.assessment_sets aset
  set subtopic_id = a.target_id,
      subtopic_title = a.title,
      updated_at = now()
  from dedup_aliases a
  where aset.subtopic_id = a.old_id
    and aset.subtopic_id <> a.target_id
  returning aset.id
)
select
  (select count(*) from matched_progress) as progress_rows_considered,
  (select count(*) from deleted_progress) as progress_rows_deleted,
  (select count(*) from inserted_progress) as progress_rows_inserted,
  (select count(*) from updated_assessments) as assessments_retargeted,
  (select count(*) from updated_question_attempts) as question_attempts_retargeted,
  (select count(*) from updated_assessment_sets) as assessment_sets_retargeted;
