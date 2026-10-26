# API options for ReviewMind

Research date: 2026-10-26. Discovery source: [public-apis](https://github.com/public-apis/public-apis).

These are integration candidates, not installed integrations or evidence of live connectivity. Account eligibility, model availability, quotas, and pricing must be checked when configuring a service.

## First priority: enable real reviews and Copilot

The existing backend sends Chat Completions requests to `LLM_BASE_URL` with a server-only key, an explicitly selected model, and JSON output validation. Do not add a second model adapter before testing this one against the selected provider.

### Groq

- Endpoint: `https://api.groq.com/openai/v1`
- Set `LLM_BASE_URL` to that endpoint, `LLM_API_KEY` to your own Groq key, and `LLM_MODEL` to an available model that supports the required JSON output contract.
- Start with `LLM_RESPONSE_FORMAT=json_object`; verify compatibility with the actual model and ReviewMind request payload before claiming support.
- [Compatibility documentation](https://console.groq.com/docs/openai)
- [Rate limits](https://console.groq.com/docs/rate-limits)

### Gemini alternative

Gemini provides an OpenAI-compatible API and a limited free tier. It still requires an account key and a supported model. Confirm request parameters against Google's compatibility documentation before switching the app. Free-tier content may be used to improve Google's products; use public or synthetic demo code when evaluating that tier.

- [Compatibility documentation](https://ai.google.dev/gemini-api/docs/openai)
- [Pricing and free-tier terms](https://ai.google.dev/gemini-api/docs/pricing)

Neither service supplies Hindsight memory. Configure Hindsight separately and run the existing live learning-cycle acceptance test after a real review succeeds.

## Next feature candidates

| Service | Proposed ReviewMind feature | Integration requirements |
| --- | --- | --- |
| [OSV](https://google.github.io/osv.dev/api/) | Known-vulnerability evidence for dependency versions | Parse explicit package ecosystem/name/version from manifests or lockfiles; query `/v1/query` or `/v1/querybatch`; show advisory IDs and source links. Do not infer installed versions from imports alone. |
| [GitHub REST](https://docs.github.com/en/rest/pulls/pulls) | Import a pull request and changed files from its URL | Start with read-only public PR import; handle pagination, unavailable/truncated patches, existing submission limits, and rate limits. Private repositories require authorized credentials. |
| [npm Registry](https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md) | Package metadata to support dependency review | Use package metadata as supporting evidence. A newer version alone is not proof of a vulnerability or a safe upgrade. |

Recommended order: configure and verify one LLM provider, prove persistent Hindsight learning, add OSV dependency checks, then GitHub PR import. These features are proposed and have not been implemented by this research update.

## Verification before declaring the provider working

1. Store the selected provider's key privately in `backend/.env`; never in frontend environment variables or tracked files.
2. Restart the backend and submit a small public/synthetic code example with memory disabled. Confirm structured findings or a valid empty result.
3. Send a Copilot message attached to the completed review and inspect the response.
4. Configure the actual Hindsight service and run `tests/test_learning_live.py` as documented in the README.
5. Record actual results, provider/model, and remaining failures without recording credentials.
