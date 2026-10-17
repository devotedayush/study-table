# Study Table

A low-friction CFA Level I practice workspace with three screens:

- **Track** (`/`): statistics from recorded interactions and completed attempts. No predicted readiness, study plans, revision recommendations, or manual progress forms. The optional syllabus shows platform engagement rather than claiming preparation completion.
- **Notes & Flashcards** (`/notes`): subject notes, downloadable study PDFs and flashcards. Opening, flipping and practising records activity automatically.
- **Mocks & Assessments** (`/mocks`): named question banks, quick practice, two-session Level I mocks, uploaded sets, on-demand AI questions, saved attempts and mistakes retrieval.

## Local development

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The bundled library and practice bank work without an account. An account syncs activity and completed attempts to Supabase.

The **Study materials** link in Notes & Flashcards opens `/materials`: 26 supplied PDFs grouped into official 2026 curriculum, AI summaries and recall notes, practice packs, and 2024 revision resources. Search and category filters help find a document; each card offers Open PDF and Download. PDFs live in the private `study-materials` Supabase bucket and require sign-in on hosted sites, following the mock-library access model. Five-minute signed links support browser PDF viewing; downloads retain the organized filenames. Local testing may use ignored `data/study-materials` when `ALLOW_LOCAL_STUDY_GUEST=true`. Catalog metadata is in `src/lib/study-material-catalog.json`; `scripts/upload-study-materials.cjs` uploads and verifies every PDF against its SHA-256 using a server-only service key. Three exact duplicates from the 29 supplied originals were consolidated.

The flashcard tab also loads the signed-in **From recall PDFs** collection from `public.recall_flashcards` through `/api/flashcards`. Cards retain canonical syllabus mappings, a source PDF/page, generation and review model metadata, and a stable identity so answer corrections preserve activity links. Three GPT-6 Luna/high agents authored separate subject groups and cross-reviewed another group's cards. These remain AI study aids; source references and an agent review do not establish full curriculum coverage or expert validation. Ethics uses the limited Ethics/GIPS section in the combined recall summary. Bundled cards remain available to guests. Source text, agent drafts, reviews, and card exports live in ignored `data/recall-flashcards`; they are not embedded in the public JavaScript bundle.

`node scripts/import-recall-flashcards.cjs --prepare` requires all three reviewed batches and validates source quotations against physical PDF pages, topic IDs, field limits, and duplicate prompts. `--import` additionally requires a server-only service key; it stages drafts, compares every saved field to the validated batch, and publishes the batch only after verification. Browser roles cannot write to this shared library. `node --test scripts/recall-card-validation.test.cjs` checks the import safeguards.

The intended Supabase project is `sacqjhcvnmnialtizdvz`. Keep credentials in ignored `.env.local`; the service-role key is not needed by this app. Never expose privileged keys as `NEXT_PUBLIC_` variables.

## Persistence

`learning_activity` and `exam_attempts` have owner-only RLS policies. The additive migration is `supabase/migrations/20261017063736_automatic_learning_activity.sql`. Existing preparation records remain untouched. Browser caches are scoped by authenticated user; guest activity stays local. A running exam is saved on this device and its timer continues across refreshes.

## AI

On-demand generation uses the Responses API with `model: gpt-6-luna` and `reasoning.effort: max`. It requires a signed-in account, a server-only `OPENAI_API_KEY`, and the existing `bump_ai_usage` quota function. Generation errors are shown rather than replaced with fabricated questions. The bundled practice bank is original AI-authored learning material, not official or recalled CFA questions.

## Exam structure

The bundled bank contains 186 original practice questions with explicit curriculum IDs. Full mocks select 180 questions across all ten subjects, two 90-question sessions at 135 minutes each, and an optional break of up to 30 minutes. Shorter sets remain practice quizzes. The runner supports autosave, flags, option elimination, highlighting, question navigation, submission review and answer explanations. Full-session answers cannot be changed after that session ends.

During an exam, the workspace fills the window and keeps the timer and Back/Next/Finish controls visible. The charcoal header/footer, green navigation and white question area follow [CFA Institute's published exam interface reference](https://www.cfainstitute.org/programs/cfa-program/candidate-resources/hardware-software). Questions are native selectable text, semantic tables and rendered mathematics; long questions and the navigator scroll independently. Fullscreen uses the browser fullscreen API, with an exit button and Escape support where available. Exiting fullscreen does not discard answers. This is a practice simulation, not official exam software or a guarantee of identical test-centre rendering.

## Checks

```sh
npm run lint
node --test src/lib/exam-analysis.test.mjs src/lib/question-content.test.mjs
npx tsc --noEmit
npm run build
```

## Imported mock papers and automatic feedback

The six supplied scans are stored in the private Supabase `study-mocks` bucket: 1,071 available questions, with 1,065 scored from usable printed keys. A full paper keeps its original two sessions and question order. Mock 3 is partial (175 available questions: questions 1–5 are absent/incomplete); Mock 4 is partial (176 questions: questions 69–72 are absent). Four questions with conflicting printed keys (Mock 1 Q54, Mock 2 Q27/Q46, Mock 3 Q64, all session 1) and Mock 3 session 1 Q65 with no printed key remain available but unscored. Mock 4 session 1 Q68 has a cut-off option list and is also unscored. Partial papers and key issues are labeled; missing answers are never guessed. Source crops remain optional provenance, and the full PDF containing keys is linked only in completed review.

On submission, topic counts, mistakes, unanswered questions and relative timing appear immediately. GPT-6 Luna/max adds evidence-linked concept explanations. Each concept offers a retry of the actual missed questions and a fresh five-question drill. Unanswered questions do not establish misunderstanding; small samples are marked as limited evidence. Completed reports sync with the saved attempt.

Structured question paragraphs, table headers/rows, LaTeX formulas, verified answer keys, curriculum mappings, selected answers and recorded timings drive the results. Inline formulas use explicit `\\(...\\)` delimiters so currency dollars remain literal. The renderer disables trusted HTML in KaTeX, supplies MathML and retains readable source text if a formula cannot render. Missing or contradictory keys remain unscored; uncertain transcriptions retain a source warning.

`scripts/transcribe-mock-library.py` converts prepared source crops using GPT-6 Luna/high and independently checks every transcription against its images in a second request. It caches responses under ignored `tmp/mock-import/native`, retains original paper backups and preserves question identity, order, curriculum mappings and scoring metadata. Run its `--pilot` first, then the full run; partial runs never replace paper files. No model is allowed to invent missing scan content or repair printed answer keys.

The current conversion has 1,056 checked transcriptions and 15 labeled source issues (clipped text or the missing option). These source warnings are separate from the six existing unscored answer-key issues. Running and completed attempts receive updated content by question ID without changing their order, answers, timing, flags, scores or saved analysis.

Before uploading prepared papers, run `node scripts/verify-native-mock-library.cjs`. It checks source identities and protected metadata against the backups, table structure, KaTeX syntax, choice counts, source references and analysis payload sizes, and reports any transcription flags separately from answer-key issues.

Private source copies and extraction output are ignored by Git (`data/imported-mocks`, `tmp/mock-import`). `scripts/upload-mock-library.cjs` uploads a prepared library with a server-only service key; it publishes the catalog last and skips unchanged content. Source files are readable by signed-in app users, not anonymous Storage requests. `ALLOW_LOCAL_STUDY_GUEST=true` in ignored `.env.local` enables local testing without signing in; leave it unset in hosted environments.
