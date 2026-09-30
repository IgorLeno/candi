"""Fake job-search dispatcher for E2E (same CLI and JSON contract as hermes/browsers/dispatch.py).

No bots, no gateway, no Sheet: every `list` advances running dispatches one stage, so the panel's progress UI
can be exercised deterministically. `persist` records a REGISTRAR_WRITESET that finishes on the second `list`
(nothing is written anywhere). Vaga indicada: LOCALIZAR_VAGA reads the text from stdin (an intake mentioning
"nao-existe" is not found: PRECISA_HUMANO/NEEDS_CONTEXT), ANALISAR_INDICADA --from produces a writeset, `discard`
marks the chain. State lives in $JOB_SEARCH_BROWSERS_STATE/fake-dispatch.json.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

STATE = Path(os.environ["JOB_SEARCH_BROWSERS_STATE"]) / "fake-dispatch.json"
JOB_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")
APPROVAL_RE = re.compile(r"(?i)\b(ok|n[aã]o)\s+[0-9a-f]{8}\b")
BOTS = {"BUSCAR_VAGAS": ("Lince", "Job Scout"), "GERAR_CURRICULO": ("CVerino", "CV Strategist"),
        "PREENCHER_CANDIDATURA": ("Candidatinho", "Application Operator"), "LOCALIZAR_VAGA": ("Lince", "Job Scout"),
        "ANALISAR_INDICADA": ("Lince", "Job Scout")}
LINCE = ("BUSCAR_VAGAS", "LOCALIZAR_VAGA", "ANALISAR_INDICADA")
# Actions whose last stage is "registro na planilha" (a writeset the panel may persist).
WRITESET_ACTIONS = ("BUSCAR_VAGAS", "ANALISAR_INDICADA")
STAGES = {
    "BUSCAR_VAGAS": [("busca", "Busca ampla e prefilter (Lince)"), ("analise", "Análise no ChatGPT (Threadgist)"),
                     ("writeset", "Writeset pronto"), ("registro", "Registro na planilha")],
    "GERAR_CURRICULO": [("cverino", "CVerino + ChatGPT (patch editorial)"),
                        ("curriculinho", "Curriculinho (cópia do MASTER no Claude Design)"),
                        ("cv", "Currículo registrado (cv.pdf + cv.json)")],
    "PREENCHER_CANDIDATURA": [("claim", "Claim e preflight"), ("preenchimento", "Preenchimento do formulário"),
                              ("revisao", "Revisão e gate"), ("aprovacao", "Aguardando sua aprovação")],
    "LOCALIZAR_VAGA": [("localizar", "Localizar a vaga (Lince)"), ("prefilter", "Análise preliminar (prefilter)")],
    "ANALISAR_INDICADA": [("analise", "Análise no ChatGPT (Threadgist)"), ("writeset", "Writeset pronto"),
                          ("registro", "Registro na planilha")],
}
REGISTER = "REGISTRAR_WRITESET"
# fake-9001 is not in the fixture Sheet: the registration stage stays open until the panel persists it.
WRITESET_JOB_IDS = {"BUSCAR_VAGAS": ["fake-1001", "fake-9001"], "ANALISAR_INDICADA": ["fake-9002"]}
LOCATED = {"found": True, "reason": None, "already_in_registry": False, "posting": True,
           "job": {"title": "Estágio em Processos Químicos", "company": "Empresa Indicada", "location": "Camaçari, BA",
                   "url": "https://exemplo.com/vagas/9002", "source": "Gupy", "job_id": "fake-9002"},
           "prefilter": {"verdict": "BLOQUEIO_GRAVE", "reasons": ["pede formatura até 12/2026"]}}
NOT_FOUND = {"found": False, "reason": "nenhuma vaga com essa descrição", "already_in_registry": False,
             "job": None, "prefilter": None, "posting": False}
DIAGNOSIS = [{"job_id": "fake-9002", "cargo": "Estágio em Processos Químicos", "empresa": "Empresa Indicada",
              "status_analise": "SELECIONADA", "interesse": "ALTO"}]
RESULT = {"jobs": {"INSERTED": 1, "UPDATED": 0, "UNCHANGED": 1}, "coverage": {"appended": 1, "present": 0},
          "dossiers": {"appended": 1, "present": 0}}


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load():
    try:
        return json.loads(STATE.read_text())
    except (OSError, ValueError):
        return []


def save(recs):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(recs))


def registration_of(recs, search_id):
    return next((r for r in recs if r["action"] == REGISTER and r["source_id"] == search_id), None)


def view_register(rec):
    done = rec["status"] == "CONCLUIDO"
    stages = [{"key": "check", "label": "Writeset VALID (writeset.py check)", "state": "done"},
              {"key": "persist", "label": "Gravação na planilha (writeset.py persist)",
               "state": "done" if done else "active"}]
    out = {k: rec[k] for k in ("id", "action", "platform", "job_id", "status", "acknowledged", "created_at",
                               "source_id")}
    out.update(code=None, marker=None, bot="job-search", active=not done, finished_at=rec["created_at"] if done
               else None, result=RESULT if done else None,
               progress={"percent": 100 if done else 53, "stages": stages,
                         "writeset_path": f"runtime/operations/{rec['source_id']}/writeset.md"})
    return out


def last_step(action):
    return len(STAGES[action]) - (1 if action in WRITESET_ACTIONS else 0)


def intake_of(rec, recs):
    origin = rec if rec["action"] == "LOCALIZAR_VAGA" else next(r for r in recs if r["id"] == rec["source_id"])
    return origin


def view(rec, recs=()):
    if rec["action"] == REGISTER:
        return view_register(rec)
    stages = STAGES[rec["action"]]
    step = rec["step"]
    last = last_step(rec["action"])
    not_found = rec["action"] == "LOCALIZAR_VAGA" and not rec["found"] and step >= last
    out_stages = []
    for i, (key, label) in enumerate(stages):
        state = "done" if i < step else "active" if i == step and rec["status"] == "RODANDO" else "pending"
        if rec["action"] in WRITESET_ACTIONS and key == "registro" and step >= last:
            state = "active"
        out_stages.append({"key": key, "label": label, "state": state})
    if not_found:
        out_stages[0].update(state="failed", note=NOT_FOUND["reason"])
        out_stages[1]["state"] = "pending"
    done = sum(1 for s in out_stages if s["state"] == "done")
    progress = {"percent": 0 if rec["status"] == "MANUAL" else 5 + round(95 * done / len(stages)),
                "stages": out_stages, "traffic": {"pending": 0}}
    if rec["action"] in ("LOCALIZAR_VAGA", "ANALISAR_INDICADA"):
        origin = intake_of(rec, recs)
        located = origin["step"] >= last_step("LOCALIZAR_VAGA")
        progress.update(intake_text=origin["intake_text"], intake_state="valid" if located else "missing",
                        intake=(LOCATED if origin["found"] else NOT_FOUND) if located else None)
        if rec["action"] == "LOCALIZAR_VAGA" and located and origin["found"]:
            out_stages[1]["note"] = "BLOQUEIO_GRAVE"
    if rec["action"] in WRITESET_ACTIONS and step >= last:
        reg = registration_of(recs, rec["id"])
        registro = out_stages[-1]
        if rec.get("discarded"):
            registro.update(state="pending", note="descartada")
        elif reg and reg["status"] == "CONCLUIDO":
            registro.update(state="done", note="gravado pelo job-search: 1 novas, 0 atualizadas, 1 sem mudança")
        elif reg:
            registro["note"] = "gravando na planilha"
        else:
            registro["note"] = "pendente de persistência"
        done = sum(1 for s in out_stages if s["state"] == "done")
        progress.update(percent=5 + round(95 * done / len(stages)), writeset_job_ids=WRITESET_JOB_IDS[rec["action"]],
                        writeset_path=f"runtime/operations/{rec.get('source_id') or rec['id']}/writeset.md",
                        registration={"id": reg["id"], "status": reg["status"], "code": None,
                                      "result": RESULT if reg["status"] == "CONCLUIDO" else None} if reg else None)
        if rec["action"] == "BUSCAR_VAGAS":
            progress.update(candidates=2, excluded=1)
        else:
            progress["diagnosis"] = DIAGNOSIS
    out = {k: rec[k] for k in ("id", "action", "platform", "job_id", "status", "acknowledged", "created_at")}
    if rec["action"] in ("LOCALIZAR_VAGA", "ANALISAR_INDICADA"):
        out.update(source_id=rec.get("source_id"), discarded=bool(rec.get("discarded")))
    out.update(code=rec.get("code"), marker=rec.get("code"), turns=step, updated_at=rec["created_at"], delivered_at=rec["created_at"],
               finished_at=None if rec["status"] == "RODANDO" else rec["created_at"],
               bot=BOTS[rec["action"]][1 if rec["platform"] == "grok" else 0],
               active=rec["status"] == "RODANDO", progress=progress)
    if rec["status"] == "MANUAL":
        out["command"] = f"[painel:dispatch {rec['id']} · {rec['action']}]\n\nComando fixo de teste."
    return out


def refuse(code):
    print(json.dumps({"ok": False, "code": code, "detail": ""}))
    return 1


def flag(argv, name):
    return argv[argv.index(name) + 1] if name in argv else None


def main(argv):
    cmd = argv[0]
    recs = load()
    if cmd == "start":
        action, platform = argv[1], flag(argv, "--platform")
        job_id, source_id = flag(argv, "--job-id"), flag(argv, "--from")
        if action in ("LOCALIZAR_VAGA", "ANALISAR_INDICADA") and platform != "hermes":
            return refuse("PLATFORM_NOT_SUPPORTED")
        if any(r["action"] == action and r["job_id"] == job_id and r["status"] == "RODANDO" for r in recs):
            return refuse("DISPATCH_ACTIVE")
        if action in LINCE and any(r["action"] in LINCE and r["status"] == "RODANDO" for r in recs):
            return refuse("PROFILE_BUSY")
        n = len(recs) + 1
        rec = {"id": f"d-20260929T12{n:04d}Z-abcdef", "action": action, "platform": platform, "job_id": job_id,
               "status": "MANUAL" if platform == "grok" else "RODANDO", "step": 0, "acknowledged": False,
               "created_at": now()}
        if action == "LOCALIZAR_VAGA":
            text = sys.stdin.read() if "--intake-stdin" in argv else ""
            if APPROVAL_RE.search(text):
                return refuse("INTAKE_LOOKS_LIKE_APPROVAL")
            if not 10 <= len(text) <= 1500:
                return refuse("INTAKE_INVALID")
            rec.update(intake_text=text, found="nao-existe" not in text.lower(), discarded=False)
        if action == "ANALISAR_INDICADA":
            origin = next((r for r in recs if r["id"] == source_id), None)
            code = ("DISPATCH_NOT_FOUND" if origin is None else "NOT_AN_INTAKE" if origin["action"] != "LOCALIZAR_VAGA"
                    else "DISCARDED" if origin.get("discarded") else "INTAKE_NOT_DONE" if origin["status"] != "CONCLUIDO"
                    else None)
            if code:
                return refuse(code)
            rec.update(source_id=source_id, discarded=False)
        recs.insert(0, rec)
        save(recs)
        print(json.dumps({"ok": True, "dispatch": view(rec, recs)}))
        return 0
    if cmd == "persist":
        search = next((r for r in recs if r["id"] == argv[1]), None)
        refusal = ("DISPATCH_NOT_FOUND" if search is None else "NOT_A_SEARCH" if search["action"] not in WRITESET_ACTIONS
                   else "DISCARDED" if search.get("discarded")
                   else "WRITESET_NOT_VALID" if search["status"] != "CONCLUIDO"
                   else "PERSIST_ACTIVE" if any(r["action"] == REGISTER and r["status"] == "RODANDO" for r in recs)
                   else "WRITESET_ALREADY_REGISTERED" if registration_of(recs, search["id"]) else None)
        if refusal:
            print(json.dumps({"ok": False, "code": refusal, "detail": ""}))
            return 1
        rec = {"id": f"d-20260929T13{len(recs) + 1:04d}Z-abcdef", "action": REGISTER, "platform": "host",
               "job_id": None, "status": "RODANDO", "step": 0, "acknowledged": False, "created_at": now(),
               "source_id": search["id"]}
        recs.insert(0, rec)
        save(recs)
        print(json.dumps({"ok": True, "dispatch": view(rec, recs)}))
        return 0
    if cmd == "list":
        job_id = argv[argv.index("--job-id") + 1] if "--job-id" in argv else None
        action = argv[argv.index("--action") + 1] if "--action" in argv else None
        if job_id is not None and not JOB_ID_RE.match(job_id):
            print(json.dumps({"ok": False, "code": "JOB_ID_INVALID", "detail": ""}))
            return 1
        for rec in recs:
            # A `list --action X` advances only X (and the persistence of X's writeset): the panel polls one
            # list per action, so every list must not move every record.
            kind = rec["action"] if rec["action"] != REGISTER else next(
                (r["action"] for r in recs if r["id"] == rec["source_id"]), None)
            if action is not None and kind != action:
                continue
            if rec["status"] == "RODANDO" and rec["action"] == REGISTER:
                # Still running on the first list after `persist`, so the panel sees it finish.
                rec["step"] += 1
                if rec["step"] >= 2:
                    rec["status"] = "CONCLUIDO"
            elif rec["status"] == "RODANDO":
                rec["step"] += 1
                if rec["step"] >= last_step(rec["action"]):
                    if rec["action"] == "LOCALIZAR_VAGA" and not rec["found"]:
                        rec.update(status="PRECISA_HUMANO", code="NEEDS_CONTEXT")
                    else:
                        rec["status"] = "CONCLUIDO"
        save(recs)
        shown = [r for r in recs if (job_id is None or r["job_id"] == job_id)
                 and (action is None or r["action"] == action)]
        out = {"ok": True, "gateway": "running", "dispatches": [view(r, recs) for r in shown[:5]]}
        if job_id is not None:
            cv_done = any(r["job_id"] == job_id and r["action"] == "GERAR_CURRICULO" and r["status"] == "CONCLUIDO"
                          for r in recs)
            out["job"] = {"job_id": job_id, "dossier": "VALID", "actionable": True,
                          "cv": "VALID" if cv_done else "MISSING", "application_state": None}
        print(json.dumps(out))
        return 0
    if cmd == "discard":
        rec = next((r for r in recs if r["id"] == argv[1]), None)
        if rec is None:
            return refuse("DISPATCH_NOT_FOUND")
        if rec["action"] not in ("LOCALIZAR_VAGA", "ANALISAR_INDICADA"):
            return refuse("NOT_AN_INTAKE")
        origin = intake_of(rec, recs)
        chain = [origin] + [r for r in recs if r["action"] == "ANALISAR_INDICADA" and r["source_id"] == origin["id"]]
        regs = [r for r in recs if r["action"] == REGISTER and r["source_id"] in {c["id"] for c in chain}]
        if any(r["status"] == "RODANDO" for r in chain + regs):
            return refuse("DISPATCH_STILL_RUNNING")
        if any(r["status"] == "CONCLUIDO" for r in regs):
            return refuse("ALREADY_REGISTERED")
        for r in chain:
            r.update(discarded=True, acknowledged=True)
        save(recs)
        print(json.dumps({"ok": True, "dispatch": view(rec, recs)}))
        return 0
    if cmd == "ack":
        for rec in recs:
            if rec["id"] == argv[1]:
                rec["acknowledged"] = True
                save(recs)
                print(json.dumps({"ok": True, "dispatch": view(rec, recs)}))
                return 0
        print(json.dumps({"ok": False, "code": "DISPATCH_NOT_FOUND", "detail": ""}))
        return 1
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
