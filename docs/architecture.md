# Foundation decisions

## Application and memory are separate

`app/storage.py` stores submitted reviews, feedback, and convention audit records. `app/memory.py` exclusively performs actual agent-memory operations through Hindsight. `app/services.py` orchestrates them. `app/providers.py` calls a configurable trusted LLM endpoint. `app/analysis.py` validates source/diff locations independently of the LLM.

The first version targets one server-configured project. The client cannot submit a different bank or project scope. Tags use `project:<PROJECT_ID>` and recall uses `all_strict` so untagged or other-project memories do not leak into review prompts. Use separate banks/authorization boundaries for separate teams. The optional shared API token protects this single-workspace demo; it is not tenant authorization.

## Review contract

`POST /api/reviews`: `{code, filename, language, input_type, use_memory}`. Returns review ID/date, original submission, summary/findings, actual retrieved evidence, model identifier, memory status, and model-reported memory influence.

For a code file, line references must exist in that file. For a unified diff, all lines in a finding range must be added lines on the new side. Deletion-only changes, binary inputs, quoted/space-complex Git paths, and semantic full-repository analysis are outside this first parser's supported scope. Inputs are never executed.

## Learning contract

`POST /api/conventions`: `{lesson, context}`. Create a pending audit record, await real synchronous Hindsight retention through the async SDK wrapper, check the SDK response's success flag, then mark retained. Failure marks failed and returns an error. A source ID is passed as `document_id` for later correction/removal support.

`POST /api/reviews/{id}/feedback`: `{finding_index, action, reason}`. Rejection needs a reason. This route records feedback only: the user teaches a lesson separately, ensuring no unverified AI finding or one-off rejection becomes a universal rule automatically.

## Provider contract and risks

Calls use the Chat Completions wire format with either JSON object output or opt-in strict JSON schema. Not every compatible provider supports every model/parameter; configure and test the endpoint/model actually available. Schema-invalid output is retried once without echoing provider payloads. Wrong line numbers or unknown citations fail the review instead of being silently accepted. Prompts delimit data and warn against code/comment instructions; this reduces but cannot eliminate prompt injection risk.

The API enforces input size, line limits, output list/field limits, transport timeouts, and concurrency slots. It does not yet provide distributed rate limiting, job queues, encrypted source storage, full auth, retention expiry, or hardened public deployment. Data deletion and export policies must be added before real organization use.

## Testing boundaries

Mock transports and injected adapters verify error handling and application logic, not real external behavior. `test_learning_live.py` is the explicit real-provider/real-Hindsight gate. It is skipped unless the operator opts in and credentials are configured. Separate model-reported influence from measured behavior; compare actual outputs before claiming improvement.
