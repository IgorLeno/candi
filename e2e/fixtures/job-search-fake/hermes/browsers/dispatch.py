"""Fake job-search dispatcher for E2E (same CLI and JSON contract as hermes/browsers/dispatch.py).

No bots, no gateway: every `list` advances running dispatches one stage, so the panel's progress UI can be
exercised deterministically. State lives in $JOB_SEARCH_BROWSERS_STATE/fake-dispatch.json.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

STATE = Path(os.environ["JOB_SEARCH_BROWSERS_STATE"]) / "fake-dispatch.json"
JOB_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")
BOTS = {"BUSCAR_VAGAS": ("Lince", "Job Scout"), "GERAR_CURRICULO": ("CVerino", "CV Strategist"),
        "PREENCHER_CANDIDATURA": ("Candidatinho", "Application Operator")}
STAGES = {
    "BUSCAR_VAGAS": [("busca", "Busca ampla e prefilter (Lince)"), ("analise", "Análise no ChatGPT (Threadgist)"),
                     ("writeset", "Writeset pronto"), ("registro", "Registro na planilha (coordenador)")],
    "GERAR_CURRICULO": [("cverino", "CVerino + ChatGPT (patch editorial)"),
                        ("curriculinho", "Curriculinho (cópia do MASTER no Claude Design)"),
                        ("cv", "Currículo registrado (cv.pdf + cv.json)")],
    "PREENCHER_CANDIDATURA": [("claim", "Claim e preflight"), ("preenchimento", "Preenchimento do formulário"),
                              ("revisao", "Revisão e gate"), ("aprovacao", "Aguardando sua aprovação")],
}


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


def view(rec):
    stages = STAGES[rec["action"]]
    step = rec["step"]
    last = len(stages) - 1 if rec["action"] == "BUSCAR_VAGAS" else len(stages)
    out_stages = []
    for i, (key, label) in enumerate(stages):
        state = "done" if i < step else "active" if i == step and rec["status"] == "RODANDO" else "pending"
        if rec["action"] == "BUSCAR_VAGAS" and key == "registro" and step >= last:
            state = "active"
        out_stages.append({"key": key, "label": label, "state": state})
    done = sum(1 for s in out_stages if s["state"] == "done")
    progress = {"percent": 0 if rec["status"] == "MANUAL" else 5 + round(95 * done / len(stages)),
                "stages": out_stages, "traffic": {"pending": 0}}
    if rec["action"] == "BUSCAR_VAGAS" and step >= last:
        progress.update(writeset_job_ids=["fake-1001", "fake-1002"],
                        writeset_path=f"runtime/operations/{rec['id']}/writeset.md", candidates=2, excluded=1)
    out = {k: rec[k] for k in ("id", "action", "platform", "job_id", "status", "acknowledged", "created_at")}
    out.update(code=None, marker=None, turns=step, updated_at=rec["created_at"], delivered_at=rec["created_at"],
               finished_at=None if rec["status"] == "RODANDO" else rec["created_at"],
               bot=BOTS[rec["action"]][1 if rec["platform"] == "grok" else 0],
               active=rec["status"] == "RODANDO", progress=progress)
    if rec["status"] == "MANUAL":
        out["command"] = f"[painel:dispatch {rec['id']} · {rec['action']}]\n\nComando fixo de teste."
    return out


def main(argv):
    cmd = argv[0]
    recs = load()
    if cmd == "start":
        action, platform = argv[1], argv[3]
        job_id = argv[5] if len(argv) > 5 else None
        if any(r["action"] == action and r["job_id"] == job_id and r["status"] == "RODANDO" for r in recs):
            print(json.dumps({"ok": False, "code": "DISPATCH_ACTIVE", "detail": ""}))
            return 1
        n = len(recs) + 1
        rec = {"id": f"d-20260929T12{n:04d}Z-abcdef", "action": action, "platform": platform, "job_id": job_id,
               "status": "MANUAL" if platform == "grok" else "RODANDO", "step": 0, "acknowledged": False,
               "created_at": now()}
        recs.insert(0, rec)
        save(recs)
        print(json.dumps({"ok": True, "dispatch": view(rec)}))
        return 0
    if cmd == "list":
        job_id = argv[argv.index("--job-id") + 1] if "--job-id" in argv else None
        action = argv[argv.index("--action") + 1] if "--action" in argv else None
        if job_id is not None and not JOB_ID_RE.match(job_id):
            print(json.dumps({"ok": False, "code": "JOB_ID_INVALID", "detail": ""}))
            return 1
        for rec in recs:
            if rec["status"] == "RODANDO":
                rec["step"] += 1
                if rec["step"] >= len(STAGES[rec["action"]]) - (1 if rec["action"] == "BUSCAR_VAGAS" else 0):
                    rec["status"] = "CONCLUIDO"
        save(recs)
        shown = [r for r in recs if (job_id is None or r["job_id"] == job_id)
                 and (action is None or r["action"] == action)]
        out = {"ok": True, "gateway": "running", "dispatches": [view(r) for r in shown[:5]]}
        if job_id is not None:
            cv_done = any(r["job_id"] == job_id and r["action"] == "GERAR_CURRICULO" and r["status"] == "CONCLUIDO"
                          for r in recs)
            out["job"] = {"job_id": job_id, "dossier": "VALID", "actionable": True,
                          "cv": "VALID" if cv_done else "MISSING", "application_state": None}
        print(json.dumps(out))
        return 0
    if cmd == "ack":
        for rec in recs:
            if rec["id"] == argv[1]:
                rec["acknowledged"] = True
                save(recs)
                print(json.dumps({"ok": True, "dispatch": view(rec)}))
                return 0
        print(json.dumps({"ok": False, "code": "DISPATCH_NOT_FOUND", "detail": ""}))
        return 1
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
