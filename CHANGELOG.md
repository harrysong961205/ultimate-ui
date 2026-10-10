# Changelog

## 0.2.0

- **References.** The skill now has the agent look at how others solved the same decision before designing a new screen ([finding-references.md](skills/ultimate-ui/references/finding-references.md)), and record it in `docs/ui-references/<id>.json`. `uui refs` validates the records (real dates, real URLs without credentials, `web`/`project`/`internal` sources); contracts can cite adopted ones in `references[]`, and `uui contract` validates every cited record and its links to questions and rules.
- **Setup for many projects.** `uui init` is safe to re-run. It adds a marked block to `AGENTS.md`/`CLAUDE.md` and enables the plugin in `.claude/settings.json`. New `uui doctor` shows what is missing.
- **One version per project.** The plugin's edit hook hands the check to the project's pinned copy, resolved the way Node resolves it (hoisted monorepo copies included). If that copy fails or takes over 30 s, the hook reports it instead of quietly using the plugin's own copy.
- **Config boundary.** The config search stops at the repository root (`.git`), so a config above a nested repository never applies inside it. `uui init --here` sets up a sub-project of a monorepo on its own.
- **Safe init.** `uui init` reads and checks everything first and changes nothing if a file is unclear (broken JSON, duplicated markers, a link out of the project). It keeps a disabled plugin disabled and a different marketplace entry as it is.
- **Floor.** Question text and rank are part of the approved floor. A rule's meaning now includes the disclosure and answers of the information it is about. Floors accepted with 0.1.0 report changed meanings once: review and accept again.
- **Color guide.** The video sections are marked as paraphrase, without quotation marks.

## 0.1.0

- Screen contracts, design-token checks (static, edit hook, render audit), screenshot review, color guide.
