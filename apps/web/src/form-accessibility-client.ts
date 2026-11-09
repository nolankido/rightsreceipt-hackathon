/** Shared focus ownership and field-error behavior for the native transaction pages. */
export const FORM_ACCESSIBILITY_CLIENT = String.raw`
  let formFocusSequence = 0;
  document.addEventListener("focusin",() => { formFocusSequence++; });
  function captureFocus() {
    return { element:document.activeElement ?? null, sequence:formFocusSequence };
  }
  function captureFocusWithin(...roots) {
    const active = document.activeElement;
    return active && roots.some(root => root && (root === active || root.contains?.(active))) ? captureFocus() : null;
  }
  function focusNow(element) {
    if (!element || document.hidden || element.disabled || element.isConnected === false
      || element.closest?.("[hidden]") || element.getAttribute?.("aria-disabled") === "true" || typeof element.focus !== "function") return false;
    element.focus(); return document.activeElement === element;
  }
  function focusAfterInteraction(ticket,element) {
    if (!ticket || ticket.sequence !== formFocusSequence || document.hidden) return false;
    const active = document.activeElement;
    if (active && active !== ticket.element && active !== document.body && active !== document.documentElement) return false;
    return focusNow(element);
  }
  // Skip navigation must not overwrite the private-code fragment or create a new history entry.
  document.querySelector?.("#skip-link")?.addEventListener("click",event => {
    event.preventDefault(); focusNow(document.getElementById("main-content"));
  });
  function formErrors(summary,list,fields,prefix) {
    const records = new Map();
    function controls(key) {
      const value = fields[key]; return (Array.isArray(value) ? value : [value]).filter(Boolean);
    }
    function describe(field,id,add) {
      const tokens = (field.getAttribute?.("aria-describedby") || "").split(/\s+/u).filter(Boolean);
      const next = tokens.filter(value => value !== id);
      if (add) next.push(id);
      if (next.length) field.setAttribute?.("aria-describedby",next.join(" "));
      else field.removeAttribute?.("aria-describedby");
    }
    function clear(key) {
      for (const [name,record] of records) {
        if (key !== undefined && name !== key) continue;
        for (const field of record.controls) { field.removeAttribute?.("aria-invalid"); describe(field,record.id,false); }
        record.note.remove?.(); record.item.remove?.(); records.delete(name);
      }
      if (!records.size) { if (summary) summary.hidden = true; list?.replaceChildren(); }
    }
    function show(issues) {
      clear();
      for (const issue of issues) {
        const targets = controls(issue.field), field = targets[0];
        if (!field || records.has(issue.field)) continue;
        const id = prefix + "-" + (field.id || issue.field), note = document.createElement("p"),
          item = document.createElement("li"), link = document.createElement("a");
        note.id = id; note.className = "field-error"; note.textContent = issue.message;
        for (const target of targets) { target.setAttribute?.("aria-invalid","true"); describe(target,id,true); }
        const last = targets[targets.length - 1], group = targets.length > 1 ? last.closest?.("fieldset") : null,
          anchor = last.closest?.("label") || last;
        if (group) group.append(note);
        else if (typeof anchor.insertAdjacentElement === "function") anchor.insertAdjacentElement("afterend",note);
        else anchor.parentNode?.insertBefore?.(note,anchor.nextSibling ?? null);
        link.href = "#" + field.id; link.textContent = issue.message;
        link.addEventListener("click",event => { event.preventDefault(); focusNow(field); });
        item.append(link); list?.append(item);
        records.set(issue.field,{ controls:targets, id, note, item });
      }
      if (summary) summary.hidden = records.size === 0;
      if (records.size) focusNow(summary);
    }
    return { show, clear };
  }
`;
