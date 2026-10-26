# Milestone 1: foundation and review slice

Date: 26 October 2026.

## Outcome

Created a new `ReviewMind` directory containing a Next.js/TypeScript frontend and a FastAPI/Pydantic backend. The local application starts and the browser can submit to the real backend. Real configurable LLM calls and Hindsight calls are implemented, but neither service is configured in this environment. The live review/learning gate is therefore not passed. No fake AI result or fake memory response is used in the application.

## Files created

Project root: `.gitignore`, `.env.example`, `README.md`.

Backend:

- `requirements.txt`, `requirements-dev.txt`, `requirements.lock.txt`, `pyproject.toml`.
- `app/__init__.py`, `config.py`, `errors.py`, `schemas.py`, `analysis.py`.
- `app/providers.py`: real configurable Chat Completions HTTP adapter with JSON/schema validation.
- `app/memory.py`: real Hindsight async retention/recall, strict project scope, explicit success/failure.
- `app/storage.py`: SQLite review, feedback, and convention audit storage.
- `app/services.py`: separate review, convention-teaching, and feedback orchestration.
- `app/main.py`: FastAPI factory, routes, safe errors, optional application token, CORS, body/concurrency limits.
- `tests/conftest.py`, `test_validation.py`, `test_provider.py`, `test_api.py`, `test_memory_contract.py`, `test_learning_live.py`.

Frontend:

- `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `.env.example`.
- `src/app/layout.tsx`, `page.tsx`, `globals.css`, `preview/page.tsx`.
- `src/components/workbench.tsx`: review form, uploads, findings, source-memory explanations, feedback, basic history, convention teaching, settings.
- `src/lib/api.ts`: typed API boundary and safe user-facing errors.
- `src/lib/samples.ts`: explicitly labeled visual fixtures used only on `/preview`.

Documentation: `docs/architecture.md`, `docs/milestone-1.md`.

Installed dependency folders, local test caches, and the runtime database are ignored. The distributable source archive excludes them and all non-example environment files.

## Commands actually run

- Created the backend virtual environment using the bundled Python 3.12.14 runtime.
- Installed the pinned Python dependencies using `python -m pip install`.
- Inspected installed `hindsight-client==1.1.0` constructor, async retain/recall, bank creation/deletion signatures, and response model fields.
- Installed frontend dependencies with `npm install --no-fund --no-audit --cache <workspace>/work/npm-cache`.
- Ran `.venv/Scripts/python.exe -m pytest -q --tb=short`.
- Ran `.venv/Scripts/python.exe -m pip check`.
- Generated `requirements.lock.txt` using `python -m pip freeze`.
- Ran `npm run typecheck`, `npm run format`, `npm run format:check`, and `npm run build`.
- Started the API with `python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000`.
- Started the compiled frontend with `npm run start`.
- Requested the live local `/api/status` endpoint; it returned `llm_configured: false` and `memory_configured: false`.
- Performed real browser actions against the local application and the separate fixture page.

## Results

| Check | Actual result |
| --- | --- |
| Backend tests | **54 passed, 1 skipped** |
| Skipped test | Real LLM + Hindsight persistent learning cycle; opt-in/credentials not configured |
| Python dependency consistency | Passed: no broken requirements |
| TypeScript checking | Passed |
| Frontend formatting check | Passed |
| Next.js production build | Passed; `/` and `/preview` generated |
| Browser real submission | Correct missing-provider error; no substituted result |
| Browser real teaching attempt | Correct missing-Hindsight error; audit entry marked failed |
| Browser fixture states | Idle, loading, success, empty, and error inspected; fixture success is not a live AI result |
| Responsive browser checks | Desktop 1280px and mobile 390px inspected; no horizontal page overflow at mobile width |
| CodeRabbit review | Not run: CodeRabbit CLI is not installed |
| Live model quality / Hindsight persistence | Not verified |
| Deployment | Not attempted |

The test suite emits one upstream warning: Starlette is deprecating its TestClient integration with `httpx` in favor of `httpx2`. The tests currently pass; no warning has been suppressed.

## Issues found and corrected

1. Pydantic inheritance initially stripped source indentation/blank lines. Disabled whitespace stripping for submissions and added a regression test.
2. Long parametrized input IDs exceeded Windows temporary-path limits. Added short test IDs.
3. The default npm cache location was not writable. Installed with an explicit workspace cache.
4. The browser's 127.0.0.1 origin was missing from the initial CORS defaults. Added both local origins and a preflight regression test.
5. Hindsight retention now checks its actual SDK `success` field rather than accepting any returned response.
6. Database connections close explicitly after each operation.
7. Editing code, paths, language, input mode, or memory mode clears stale review results.

## Configuration required next

Copy root `.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. Set:

- `LLM_API_KEY`, `LLM_MODEL`, and the trusted `LLM_BASE_URL`.
- `LLM_RESPONSE_FORMAT` for the selected provider's supported structured-output mode.
- `HINDSIGHT_BASE_URL`, `HINDSIGHT_API_KEY` if required, and an existing `HINDSIGHT_BANK_ID`.
- `PROJECT_ID` and a corresponding private `DATABASE_PATH`.
- Optional `API_TOKEN` for protected private demonstrations.

Do not send provider keys in chat. The README describes all configuration variables, data handling, startup commands, and limitations.

## Exact next step

Configure the actual services in `backend/.env`, restart the backend, and run the real acceptance gate from `backend`:

```powershell
$env:RUN_LIVE_TESTS = '1'
.venv/Scripts/python.exe -m pytest tests/test_learning_live.py -v
Remove-Item Env:RUN_LIVE_TESTS
```

This uses real APIs and may consume provider/Hindsight credits. It creates and removes a unique disposable test bank; the credential must allow that test workflow. No existing application bank is cleared. A real failure stays a failure.

Then perform the same shared-client/direct-call learning cycle in the UI and inspect the recalled evidence and model-reported explanation. Only after that gate passes should work proceed to broader memory editing, comparisons/evaluation, or GitHub integration.

## Limits of this milestone

No evidence yet establishes improved real model behavior, correct live persistence, or production readiness. Feedback is explicitly recorded but not automatically promoted to memory; saved feedback states are not reloaded into history controls yet. Memory correction/removal, teach-request idempotency, broader diff syntax, comparison dashboard, multi-user auth, and deployment remain later work. Keep one local database per configured workspace. The application is intended for a protected local demo at this stage.
