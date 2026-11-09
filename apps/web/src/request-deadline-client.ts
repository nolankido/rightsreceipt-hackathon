/** Bound one browser request, including JSON consumption, without repeating a command. */
export const REQUEST_DEADLINE_CLIENT = String.raw`
  const REQUEST_TIMEOUT_MS = 15000;
  const REQUEST_JSON_MAX_BYTES = 262144;
  function deadlineRequestError(message,code) {
    const error = new Error(message); error.code = code;
    error.name = code === "request_timeout" ? "TimeoutError" : "AbortError";
    return error;
  }
  function requestResponseError() {
    const error = new Error("The response could not be processed safely. Retry the same command or reload the current record.");
    error.code = "response_invalid";
    return error;
  }
  function requestMonotonicNow() {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  }
  async function readJsonWithDeadline(path,init,{checkResponse,timeoutMessage}) {
    if (typeof checkResponse !== "function" || typeof timeoutMessage !== "string" || !timeoutMessage) {
      throw new Error("A bounded request configuration is required.");
    }
    const parent = init.signal, request = new AbortController(), wallStart = Date.now(), monotonicStart = requestMonotonicNow();
    const aborted = () => deadlineRequestError("This private view changed before a response was confirmed.","request_aborted");
    if (parent?.aborted) throw aborted();
    let timer = null, stopped = null, finished = false, rejectDeadline, body = null, reader = null;
    const deadline = new Promise((_resolve,reject) => { rejectDeadline = reject; });
    function releaseBody(cancel) {
      const active = reader, unread = body; reader = null; body = null;
      if (cancel) { try { Promise.resolve(active ? active.cancel() : unread?.cancel()).catch(() => {}); } catch {} }
      if (active) { try { active.releaseLock(); } catch {} }
    }
    function stop(error) {
      if (finished || stopped) return;
      stopped = error; releaseBody(true); request.abort(); rejectDeadline(error);
    }
    function check() {
      if (!stopped && parent?.aborted) stop(aborted());
      if (!stopped && (Date.now() - wallStart >= REQUEST_TIMEOUT_MS || requestMonotonicNow() - monotonicStart >= REQUEST_TIMEOUT_MS)) {
        stop(deadlineRequestError(timeoutMessage,"request_timeout"));
      }
      if (stopped) throw stopped;
    }
    async function boundedJson(response) {
      body = response.body ?? null;
      // The production Fetch Response exposes a ReadableStream. Retain the
      // old complete-body path only for non-browser test doubles with no body.
      if (!body || typeof body.getReader !== "function") {
        const value = await response.json(); check(); return value;
      }
      const length = response.headers.get("Content-Length");
      const encoding = (response.headers.get("Content-Encoding") || "").trim().toLowerCase();
      let declared = null;
      if (length !== null) {
        const text = length.trim();
        if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw requestResponseError();
        // Fetch exposes decoded bytes. A compressed wire length is validated
        // as metadata but is not compared with the decoded response size.
        if (!encoding || encoding === "identity") declared = Number(text);
      }
      if (declared !== null && (declared < 1 || declared > REQUEST_JSON_MAX_BYTES)) throw requestResponseError();
      try { reader = body.getReader(); } catch { throw requestResponseError(); }
      const active = reader, bytes = new Uint8Array(REQUEST_JSON_MAX_BYTES); let size = 0;
      while (true) {
        check(); const part = await active.read(); check();
        if (part.done) break;
        if (!(part.value instanceof Uint8Array) || part.value.byteLength > REQUEST_JSON_MAX_BYTES - size
          || (declared !== null && part.value.byteLength > declared - size)) throw requestResponseError();
        bytes.set(part.value,size); size += part.value.byteLength;
      }
      if (size < 1 || (declared !== null && size !== declared)) throw requestResponseError();
      releaseBody(false); check();
      try { return JSON.parse(new TextDecoder("utf-8").decode(bytes.subarray(0,size))); }
      catch { throw requestResponseError(); }
    }
    const onAbort = () => stop(aborted());
    // The race owns both rejection handlers before a request can settle late.
    const operation = async () => {
      try {
        check();
        const response = await fetch(path,{...init,signal:request.signal});
        check(); checkResponse(response); check();
        const value = await boundedJson(response);
        check(); return value;
      } finally { releaseBody(true); }
    };
    try {
      parent?.addEventListener("abort",onAbort,{once:true});
      timer = setTimeout(() => stop(deadlineRequestError(timeoutMessage,"request_timeout")),REQUEST_TIMEOUT_MS);
      const value = await Promise.race([Promise.resolve().then(operation),deadline]);
      check(); return value;
    } catch (error) {
      check(); request.abort(); throw error;
    } finally {
      finished = true; releaseBody(true); clearTimeout(timer); parent?.removeEventListener("abort",onAbort);
    }
  }
`;
