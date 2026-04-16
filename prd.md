In-Depth Product Prompt / PRD
Product Title
Adaptive CFA Level 1 Preparation Dashboard for a Single User
Product Overview
Build a highly polished web application for a single user only: a personal CFA Level 1 preparation platform for my girlfriend. The app should be designed for one account with a simple login/password system and should use Supabase as the backend for authentication, database, and storage.
The purpose of the platform is to help her prepare efficiently for CFA Level 1 under a compressed and variable timeline. The app must not assume a fixed number of preparation days. Instead, the user should enter her exam date, and the entire planning logic, urgency, pacing, and readiness system should adapt dynamically based on how many days remain.
This is not just a progress tracker. It is an adaptive exam-readiness platform that should help her understand:
what she has completed
what remains
what she is weak in
what she feels confident about
what the AI believes she actually knows
what she should study next
what she must revise today
whether she is realistically on track for the exam
The product should feel like a personal study cockpit: visual, motivating, intelligent, and dynamic.
Core Product Philosophy
The app should optimize for five things:
Coverage
Ensure the full syllabus is visible and trackable.
Retention
Ensure topics do not disappear after first completion and come back for revision.
Calibration
Compare self-confidence with actual demonstrated mastery.
Adaptivity
Recalculate priorities based on progress, weakness, backlog, and time left.
Low-friction execution
The app should help her take the next best action quickly instead of forcing too much manual planning.
This should feel like a system that actively helps her prepare rather than just recording what happened.
Target User
A single dedicated user preparing for CFA Level 1.
User characteristics:
preparing under time pressure
may start late
may plan well but not always execute everything
needs visual clarity
needs motivation and realistic prioritization
benefits from both structured planning and adaptive rebalancing
should be able to use the app daily with minimal friction
No multi-user functionality is needed. No team features. No admin panel beyond what is minimally necessary. The app should be intentionally designed around one user.
Key Use Cases
The platform should support the following recurring use cases:
Daily planning
The user logs in and immediately sees:
days left to exam
what is due today
what is overdue
what should be studied next
which topics are at risk
Topic completion
The user studies a topic or subtopic and marks it as completed or revised.
Self-evaluation
After finishing a topic, the user rates her own confidence level.
AI evaluation
The app generates topic-specific questions and uses the ChatGPT API to assess her performance.
Revision management
Topics automatically come back for revision based on completion date, mastery, and forgetting risk.
Weakness identification
The app highlights weak, neglected, overdue, and misleadingly “completed” topics.
Readiness awareness
The user sees whether she is simply progressing or actually becoming exam-ready.
Recovery from slippage
If the user falls behind or misses tasks, the app should rebalance rather than becoming demotivating or unusable.
Functional Requirements
1. Authentication and Access
Goal
Provide simple and secure single-user authentication.
Requirements
Use Supabase Auth
Support username/password sign-in in the UI, backed by a private email-based Supabase auth record
Only one intended user account is necessary
Include secure session handling
Keep UX simple and fast
Add optional “remember me” functionality if useful
Notes
Do not overengineer user management. This is a private tool for one person.

Implementation note
- The visible login form should ask for username and password.
- Onboarding should collect username, email, password, exam date, study volume, preferred session length, pacing style, and rest days.
- The dashboard should derive countdowns and urgency from the stored exam date rather than from any fixed day count.
2. Onboarding and Setup
Goal
Let the user configure exam-specific context so the platform can adapt dynamically.
Requirements
On first use, or in settings, let the user set:
exam date
target study hours per day or per week (optional)
preferred study session duration (optional)
optional start date if needed for analytics
whether she wants more aggressive or more balanced planning
optional preferred rest day(s)
Important
The app must dynamically compute:
total days remaining
time pressure level
suggested daily load
recommended pacing
Do not hardcode 45 days or 1.5 months. The exam date drives all pacing logic.

Visual direction
- Use a white and pink palette with soft shadows, rounded surfaces, and airy spacing.
- Avoid dark-mode defaults and avoid demo-looking hardcoded KPI values on the main screens.
3. CFA Level 1 Syllabus Structure
Goal
Represent the syllabus in a clean, hierarchical, trackable way.
Requirements
Preload the CFA Level 1 syllabus into a structured hierarchy such as:
Subject
Topic
Subtopic
Each subtopic should be independently trackable.
Each item should support fields such as:
title
parent topic
status
priority weight
notes
time estimate
completion history
last studied date
revision due date
self-confidence score
AI mastery score
Status values
Support a structured status system such as:
not started
in progress
completed once
revised
mastered
weak / flagged for review
Notes
The UI should make it easy to drill from subject to topic to subtopic while also preserving top-level visibility.
4. Progress Tracking
Goal
Allow the user to quickly log progress with minimal friction.
Requirements
For each topic/subtopic, the user should be able to:
mark status
log study time
enter date studied
add optional notes
rate self-confidence on a 1–5 scale
mark whether the topic was newly learned or revised
optionally mark whether the session felt easy, medium, or hard
Additional requirements
Track:
cumulative time spent on each topic
first completion date
most recent study date
number of revisions completed
average self-confidence over time
UX requirement
Logging progress should take seconds, not minutes.
5. Dual Confidence / Mastery Model
Goal
Represent both subjective and objective preparedness.
Requirements
For each topic/subtopic, store and display:
A. Self-confidence
User manually rates how confident she feels after completion or revision.
Scale example:
1 = very weak
2 = weak
3 = moderate
4 = good
5 = strong
B. AI mastery
The system assigns a performance-based score derived from AI-generated assessment.
Derived metric
Compute a confidence gap:
confidence_gap = self_confidence_score - ai_mastery_score_normalized
Use this to identify:
overconfidence
underconfidence
poor calibration
stable understanding
Visual requirement
Display self-confidence and AI mastery side by side wherever useful.
6. AI Assessment Engine
Goal
Use ChatGPT API to assess topic understanding and produce actionable feedback.
Requirements
For any completed or revised topic/subtopic, the user should be able to trigger an AI assessment.
The AI should:
generate topic-specific MCQs
optionally generate conceptual or explanation-based questions
adapt difficulty if possible
evaluate answers
explain correct and incorrect options
estimate topic mastery
identify likely mistake patterns
Output requirements
For each assessment, store:
topic/subtopic
date
generated questions
user answers
score
AI mastery estimate
error categories
explanation summary
recommended next action
Suggested mistake categories
conceptual misunderstanding
formula confusion
memory lapse
careless error
poor elimination reasoning
weak retention
time-pressure issue
Important design constraint
The AI should be structured and evaluative, not chatty or vague.
It should feel like an exam-oriented topic assessor, not a generic tutor.
7. Revision Scheduling System
Goal
Prevent forgetting and create intelligent repeat exposure.
Requirements
Once a topic is marked completed, the app should automatically schedule revisions.
Suggested scheduling logic
Base revision scheduling on:
days since last study
AI mastery
self-confidence
number of prior revisions
importance of topic
whether it has become overdue
exam date proximity
Example behavior
weak topics reappear sooner
strong topics can be pushed slightly later
overdue revisions become more visible
near exam date, revision density increases
Views needed
The user should be able to see:
due today
overdue
upcoming revisions
revision calendar / queue
Notes
The algorithm does not need to be medically precise spaced repetition, but it should be directionally smart and adaptive.
8. Daily Planner / Priority Engine
Goal
Generate an actionable daily plan.
Requirements
The app should automatically recommend what to study each day based on:
exam date
days remaining
syllabus completion
weak topics
overdue revisions
AI mastery
self-confidence
topic importance
recent study history
backlog
study hour target if provided
Daily planner should output
recommended new topics to cover
revision topics due today
optional quiz / reinforcement tasks
estimated total study load
reasoning for why each task is recommended
Very important
If the user misses tasks, the system should rebalance intelligently.
It should not simply pile all unfinished tasks on the next day in a way that becomes psychologically crushing.
Recovery behavior
If the user falls behind:
preserve high-priority tasks
compress or defer lower-value tasks
surface a “recovery mode” plan if needed
highlight realistic next-best actions
9. Dashboard
Goal
Create a motivating and highly informative home screen.
Requirements
The dashboard should show:
Top summary
days left until exam
exam date
total syllabus completion percentage
overall readiness score
revision backlog count
today’s study load estimate
Actionable sections
today’s top tasks
revisions due today
overdue weak topics
recently completed topics
high-priority topics not yet started
quick access to “what should I study now?”
Visual analytics
subject-wise progress bars
weak-topic heatmap
readiness vs completion comparison
recent study trend
time spent trend
confidence vs mastery pattern
UX tone
The dashboard should feel:
clear
elegant
dynamic
motivating
supportive
It should not feel punishing, cluttered, or stressful.
10. Readiness Score
Goal
Provide a meaningful indicator of exam preparedness.
Requirements
Create a derived readiness score that is different from completion percentage.
Completion percentage means
“How much of the syllabus has been covered?”
Readiness score means
“How prepared is the user to perform on the exam if it were near-term?”
Readiness score should consider factors like
syllabus coverage
AI mastery
revision freshness
confidence calibration
weak-topic concentration
overdue revisions
mock performance
recent momentum
Output
Show:
overall readiness score
readiness score by subject
readiness trend over time if possible
Important
The readiness score should be interpretable, not arbitrary. Document the logic.
11. Mock Test and Practice Exam Tracking
Goal
Incorporate performance from mock exams and practice sessions.
Requirements
Allow the user to manually log:
mock exam date
total score
section-wise score
time taken
notes
emotional difficulty / felt performance (optional)
Analysis requirements
Use mock data to show:
weakest sections
strongest sections
score trend over time
time management issues
recurring underperformance patterns
recommended revision priorities
Notes
This should connect back into readiness and daily planning logic if possible.
12. Time Tracking and Study Analytics
Goal
Help the user understand how time is being spent.
Requirements
Track:
total time spent
time per subject
time per topic
time per session
average study duration
weekly study load
focus trend over time
Derived insights
The app should be able to indicate patterns like:
too much time spent on low-value topics
weak but neglected areas
subjects moving slower than expected
good momentum in recent days
irregular study rhythm
Visuals
Use clean charts and analytics cards.
13. Quick Action Engine
Goal
Reduce decision fatigue.
Requirements
Include a prominent action like:
“What should I study now?”
When triggered, the app should recommend the top 1 to 3 tasks based on current urgency and importance.
For each recommendation, show:
task title
task type: new study / revision / quiz / mock review
estimated effort
why it is recommended
optional “start now” CTA
This should be one of the most useful everyday features.
14. Notes, Reflection, and Session Logging
Goal
Allow lightweight reflection without burden.
Requirements
After a session, optionally allow the user to record:
what was studied
what felt difficult
what needs revision later
formula confusion or conceptual gaps
freeform notes
Notes
Keep this optional and simple. Do not make journaling required.
15. Settings and Preferences
Requirements
Allow updating:
exam date
study target
preferred pacing mode
revision behavior preferences if needed
visual preferences if applicable
If the exam date changes, all adaptive logic should update automatically.
Non-Functional Requirements
Design and UX
modern, elegant UI
visually strong but not flashy
highly usable on desktop
responsive for mobile/tablet if possible
minimal friction
psychologically supportive tone
avoid overwhelming the user with too many numbers at once
Performance
fast page loads
fast state updates
smooth interactions
async AI evaluation with clear feedback states
Security
secure auth
secure API key handling
keep OpenAI/ChatGPT API keys on server side only
proper row-level security in Supabase where relevant
Maintainability
modular architecture
clear separation of concerns
clean, production-quality codebase
scalable enough for future features, even though current use is single-user
Technical Requirements
Preferred Stack
Frontend: Next.js
Backend: Supabase
AI integration: OpenAI / ChatGPT API
Styling: Tailwind CSS preferred
Charts: any good React chart library
State management: keep simple and clean, choose sensibly
Supabase usage
Use Supabase for:
auth
database
optional storage
row-level security where useful
API requirements
Create server-side logic for:
AI question generation
answer evaluation
mastery scoring
recommendation generation if needed
Never expose API secrets to the client.
Suggested Data Model
Design the schema thoughtfully. At minimum include tables like:
profiles
exam_settings
subjects
topics
subtopics
study_sessions
progress_records
self_ratings
ai_assessments
revision_schedule
mock_tests
mock_section_scores
notes
daily_plan_snapshots
You may merge some tables if architecturally cleaner, but preserve the functional clarity.
Each topic/subtopic should support:
status
time spent
self-confidence
AI mastery
revision due
last studied
times revised
notes count
priority weight
Suggested Product Logic
A. Topic Priority Score
Create a dynamic priority score using factors such as:
topic importance / syllabus weight
not yet started status
weak mastery
overdue revision
low confidence
high confidence gap
exam proximity
neglect duration
Use this to drive recommendations.
B. Readiness Logic
Create a readiness formula that rewards:
actual coverage
repeated revision
high mastery
recent practice
strong mock results
And penalizes:
overdue revisions
weak important topics
false confidence
neglected sections
C. Revision Logic
Adaptive scheduling should respond to:
strong performance → later revision
weak performance → earlier revision
no revision history → normal cycle
exam close → higher frequency
D. Daily Plan Logic
Generate a balanced plan including:
one or more new learning tasks
revision tasks due
weak-topic reinforcement
optional assessment block
Must adapt if the user is behind.
Recommended Pages / Screens
1. Login
Simple and elegant.
2. Onboarding / Setup
Set exam date and preferences.
3. Dashboard
Main overview and recommendations.
4. Syllabus Explorer
Subject → topic → subtopic structure with filters and statuses.
5. Topic Detail View
Detailed view for one topic:
progress history
confidence
AI mastery
notes
revisions
take assessment
6. Revision Queue
Everything due today / overdue / upcoming.
7. Quiz / Assessment Experience
AI-generated quiz flow and results.
8. Analytics
Charts and insights.
9. Mock Test Tracker
Enter and review mock data.
10. Settings
Exam date and preferences.
UI / Visualization Requirements
The product should be highly visual. Use elements such as:
progress bars
donut charts
heatmaps
status badges
confidence vs mastery comparisons
timelines
trend charts
urgency indicators
readiness cards
Potential useful views:
subject completion bars
weak-topic heatmap
revision urgency matrix
readiness trend line
confidence gap chart
study-time trend chart
mock score progression chart
Be careful not to create clutter. Visuals should clarify, not decorate.
MVP vs Future Scope
MVP should include
authentication
exam date setup
syllabus structure
progress tracking
self-confidence rating
AI topic quiz and evaluation
dashboard
readiness score
revision scheduling
daily recommendations
analytics basics
Future enhancements
formula flashcards
voice reflection input
smarter recommendation engine
streak and habit coaching
emotional support nudges
smarter exam-weight-based optimization
custom topic import
PDF upload and source-linked quizzes from her study material
Important Product Constraints
This is for one user only
Avoid enterprise-style complexity
Avoid unnecessary collaboration or sharing features
Minimize manual input burden
Do not build generic course-management complexity
Keep the product emotionally helpful, not punishing
Focus on actual exam usefulness over novelty
Desired Deliverables from the Builder / Coding Model
Please provide the following in the response or implementation:
Full product architecture
Detailed database schema
Suggested Supabase table definitions
Page-by-page breakdown
Component breakdown
Key user flows
AI assessment flow
Daily planning logic
Readiness score logic
Revision scheduling logic
Sample seeded CFA Level 1 syllabus data
Implementation roadmap
Folder structure
API route structure
Tradeoffs and assumptions
Production-quality starter code or implementation skeleton where possible
Final Instruction to the Builder / Model
Build this as a genuinely usable and polished product, not just a demo.
It should feel like a serious personal preparation system for a high-stakes exam under a variable timeline.
Prioritize clarity, adaptivity, speed, and usefulness.
The single most important thing is that the user should be able to open the app any day and immediately understand:
where she stands
what she should do next
what she is weak in
how ready she actually is
Tighter version if you want a cleaner execution prompt
If you want a more compact but still strong version, use this:
Build a polished single-user CFA Level 1 preparation web app using Next.js, Supabase, and the ChatGPT API. The app should act as an adaptive study cockpit, not just a tracker. The user should enter her exam date, and all planning, urgency, readiness, and revision logic should dynamically adapt to days remaining. Include syllabus tracking by subject/topic/subtopic, self-confidence scoring, AI-generated topic quizzes and mastery scoring, confidence-gap analysis, revision scheduling, a daily recommendation engine, a readiness score, mock exam tracking, time analytics, and a highly visual dashboard. Optimize for compressed and variable study timelines, minimal friction, dynamic rebalancing when the user falls behind, and emotionally supportive UX. Provide full architecture, schema, planning logic, page/component breakdown, and implementation-ready technical structure.
One smart addition I’d strongly recommend
Add this requirement too:
Include a “Recovery Mode” system that activates when the user falls significantly behind schedule. In this mode, the app should automatically prioritize the highest-value topics, reduce overload, defer low-priority tasks, and present a psychologically manageable catch-up plan.
That is especially useful in your case because you already know execution drops happen.
