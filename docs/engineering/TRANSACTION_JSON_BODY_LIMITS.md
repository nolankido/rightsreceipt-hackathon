# Shared Transaction JSON Body Limits

**Owning turn:** 047  
**Release commit:** `e5abfb0df494d49a09bfdeb4d34f91fde289592c`

The six transaction clients share `readJsonWithDeadline`:

- creator review;
- buyer review;
- creator clarification;
- buyer clarification;
- creator request intake;
- buyer request intake.

Their server responses are JSON control/view DTOs, not receipt exports or arbitrary file payloads. Turn 047 applies one conservative decoded-body ceiling of **262,144 bytes** to this shared boundary.

## Contract

For browser Fetch responses:

1. HTTP and content-type validation still runs before body parsing.
2. The response body must be a readable byte stream.
3. Identity `Content-Length`, when present, must be a positive safe decimal integer no larger than 262,144.
4. Each decoded chunk must fit within the remaining fixed-capacity buffer.
5. Identity declared length must equal actual decoded bytes at EOF.
6. Encoded/compressed `Content-Length` is syntax-checked but is not treated as decoded length.
7. Empty, oversized, malformed or non-JSON bodies fail closed.
8. Overflow, timeout, parent cancellation and failure cancel/release the active reader.
9. The original 15-second request deadline is not restarted after headers.
10. The helper does not retry commands.

The ceiling is intentionally much larger than the current bounded user-entered text and normal transaction DTOs. It is a defensive transport boundary, not a promise that any DTO near the ceiling is valid. Each caller still applies its own schema/identity validation.

## Recovery semantics

A network or response failure during a mutation cannot prove that the server did not commit the command. The existing clients therefore retain their exact-command retry/reload behavior. Bounding the response does not authorize an automatic retry and does not change provider idempotency or durable invoice recovery.

## Verification limits

Turn 047 used the exact staged helper source in an independent Node 22.16.0 VM harness and a GitHub automated re-review. The re-review caught and then cleared a VM-realm compatibility regression.

The complete repository regression and installed-library build remain release-candidate gates. This guide does not claim live Worker, D1, managed-session or genuine PayPal Sandbox verification.
