# Mock library display repairs — 26 October 2026

The private mock library was reviewed after a report of improperly printed questions in Mock 6. Three GPT-6 Luna agents using maximum reasoning screened all 1,071 question records and compared suspicious content with source crops and full-page scans.

## Live library update

Mock 6 received repairs in 27 question records:

- Restored unambiguous clipped words or grammatical joins in Session 1 questions 75, 76, and 78, and Session 2 questions 15, 18, 31, 39, 40, 42, 60, and 83. This includes clipped answer-option text in questions 40 and 83.
- Removed 12 duplicate printed question headings and two scan imprints.
- Corrected one obvious spelling error in an answer option.
- Removed an empty table spacer row.

The other five mocks received display repairs in 63 records: 54 duplicate headings, three clipped stems, four tables containing empty spacer rows, one stray character, and one spacing issue.

Restored source fragments remain marked `needs_review`, with notes distinguishing editorial restoration from source verification. Original scans are preserved. No question IDs, order, answer-key indexes, scoring metadata, or saved attempts were changed.

## Remaining source limitations

Mock 4, Session 1, question 68 has an answer option missing from the source and remains unscored. The six existing unverified answer records remain unscored. Mock 5, Session 1, question 5 has a name inconsistency in the printed source that was not silently rewritten. This review does not establish independent financial answer-key correctness.

## Validation and storage

- The complete library integrity audit passed with zero issues.
- A regression check against the original library found 172 issues across all four newly checked defect categories; the corrected library passed the same check.
- All 1,071 questions and 175 tables rendered through the existing question renderer; its seven tests passed.
- Corrected Mock 6 samples received a visual check.
- All six private Storage manifests were downloaded through the standard application SDK and matched the validated local files after publication.

The corrected JSON files, original scans, backups, and detailed private audit remain gitignored. They are served from the existing private `study-mocks` Supabase Storage bucket; a website redeployment is unnecessary for these data changes.

Run the pre-upload check from a checkout containing the private library and original JSON backups:

```sh
node scripts/verify-native-mock-library.cjs
node --test src/lib/question-content.test.mjs
```

The audit now rejects unresolved scan-cutoff markers, duplicate printed headings, scan imprints, and wholly empty table spacer rows in both plain-text prompts and rendered content. Source-review notes may still document clipped scans, and explicitly unavailable options remain permitted only on unscored questions under the existing checks.
