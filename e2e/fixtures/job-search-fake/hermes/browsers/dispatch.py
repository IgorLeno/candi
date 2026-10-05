"""Fake job-search dispatcher for E2E (same CLI and JSON contract as hermes/browsers/dispatch.py).

No bots, no gateway, no Sheet: every `list` advances running dispatches one stage, so the panel's progress UI
can be exercised deterministically. `persist` records a REGISTRAR_WRITESET that finishes on the second `list`
(nothing is written anywhere). Vaga indicada: LOCALIZAR_VAGA reads the text from stdin (an intake mentioning
"nao-existe" is not found: PRECISA_HUMANO/NEEDS_CONTEXT with two candidates; `LOCALIZAR_VAGA --from <id>` with
`--candidate N` or a stdin complement locates it), ANALISAR_INDICADA --from produces a writeset, `discard`
marks the chain and `delete` hides the whole lineage from `list`. `decline <job_id>` answers like `application.py decline` without writing anything (fake-1006, sent in
the fixture, is refused with ALREADY_SENT). `delete-job <job_id>` answers like `application.py delete` without deleting
anything (fake-1006 → ALREADY_SENT, fake-1002 → DELETE_PARTIAL). "Preencher vaga" of fake-1010 on Hermes is refused with APPLICATION_CDP_DOWN. "Preencher vaga" of fake-1007 on Hermes follows the host path and ends with
the prompt to paste (`prompt_stale` once a later "Pedir edição" finished). `record-sent <job_id> --evidence <tipo>`
answers ENVIADA without writing
anything (fake-1006 → ALREADY_SENT). `mark-closed <job_id>` answers ENCERRADA the same way. `confirm-open <job_id>` answers ABERTA without
writing anything (fake-1005 → DOSSIER_NOT_VALID, also for GERAR_CURRICULO/PREENCHER_CANDIDATURA: never analysed;
the job's verdict, availability or application never refuse, like job-search on the host). ANALISAR_VAGA (Hermes only) walks planilha → posting → ChatGPT → writeset
for the requested job_id; fake-1008 has no posting (PRECISA_HUMANO/POSTING_UNAVAILABLE) and a running host pipeline
with ChatGPT refuses another with CHATGPT_BUSY. GERAR_CURRICULO of fake-1003 on Hermes stops in PRECISA_HUMANO with
`progress.recovery` (Claude stopped without PDF); `resume-cv <id> --option claude|chatgpt [--note-stdin]` starts a new
run that finishes. A finished BUSCAR_VAGAS lists the jobs it left out (`LEFT_OUT`);
`ANALISAR_DESCOBERTA --from <search> --job-id` walks posting → ChatGPT → writeset for one of them (fake-1001:
ALREADY_IN_RUNTIME, fake-9104: LEFT_OUT_WITHOUT_CARD). EDITAR_CURRICULO (stdin) needs a finished GERAR_CURRICULO of the
job (CV_NOT_READY) and no résumé run (CV_DOC_BUSY); once done, `cv-file` answers the `-v2` PDF. `cv-file <job_id>` answers a tiny PDF once its GERAR_CURRICULO finished (CV_NOT_VALID/
CV_JSON_MISSING before). `open-browser clouddesign|application` opens nothing and answers already_open false. State lives in $JOB_SEARCH_BROWSERS_STATE/fake-dispatch.json.
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

FAKE_PDF = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj "
            b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")
STATE = Path(os.environ["JOB_SEARCH_BROWSERS_STATE"]) / "fake-dispatch.json"
JOB_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")
APPROVAL_RE = re.compile(r"(?i)\b(ok|n[aã]o)\s+[0-9a-f]{8}\b")
BOTS = {"BUSCAR_VAGAS": ("Lince", "Job Scout"), "GERAR_CURRICULO": ("CVerino", "CV Strategist"),
        "PREENCHER_CANDIDATURA": ("Candidatinho", "Application Operator"), "LOCALIZAR_VAGA": ("Lince", "Job Scout"),
        "ANALISAR_INDICADA": ("ChatGPT (host)", "Job Scout"), "ANALISAR_VAGA": ("ChatGPT (host)", "Job Scout"),
        "ANALISAR_DESCOBERTA": ("ChatGPT (host)", "Job Scout"),
        "EDITAR_CURRICULO": ("Claude in Chrome (host)", "CV Operator")}
LINCE = ("BUSCAR_VAGAS", "LOCALIZAR_VAGA")
# Actions whose last stage is "registro na planilha" (a writeset the panel may persist).
WRITESET_ACTIONS = ("BUSCAR_VAGAS", "ANALISAR_INDICADA", "ANALISAR_VAGA", "ANALISAR_DESCOBERTA")
HERMES_ONLY = ("LOCALIZAR_VAGA", "ANALISAR_INDICADA", "ANALISAR_VAGA", "ANALISAR_DESCOBERTA")
CHATGPT_HOST = ("BUSCAR_VAGAS", "GERAR_CURRICULO", "ANALISAR_VAGA", "ANALISAR_INDICADA", "ANALISAR_DESCOBERTA")
HOST_ANALYSES = ("ANALISAR_VAGA", "ANALISAR_INDICADA", "ANALISAR_DESCOBERTA")


def left_out(job_id, kind, motivo, cargo, *, url=True, in_runtime=False):
    return {"job_id": job_id, "empresa": "Empresa de Fora", "cargo": cargo, "local": "Belo Horizonte, MG",
            "url": f"https://www.linkedin.com/jobs/view/{job_id}" if url else "", "fonte": "LinkedIn",
            "motivo": motivo, "kind": kind, "data": "2026-10-01", "has_card": url, "in_runtime": in_runtime}


# What a finished search left out (decision 2026-10-03): fake-1001 was analysed some other way (already in the Sheet)
# and fake-9104 comes from an older search without the card.
LEFT_OUT = {"excluded": [left_out("fake-9101", "PREFILTRO", "estágio/aprendiz (job-preferences: não elegível)",
                                  "Estagiário de Processos"),
                         left_out("fake-1001", "ENCERRADA", "ENCERRADA", "Analista de Processos Júnior",
                                  in_runtime=True)],
            "deferred": [left_out("fake-9103", "LIMITE", "acima do limite de 12 análises por rodada",
                                  "Analista de Dados Júnior"),
                         left_out("fake-9104", "LIMITE", "acima do limite de 12 análises por rodada",
                                  "Engenheiro de Processos", url=False)]}
NO_POSTING = "fake-1008"
STUCK_CV = "fake-1003"
MARKERS_RE = re.compile(r"\b(PATCH_READY|NEEDS_CONTEXT|BLOCKED|WAITING|AWAITING_APPROVAL)\b")
RECOVERY = {
    "reason": "O Claude in Chrome parou sem exportar o PDF.",
    "claude_reason": "o CHANGE 4 (mandatory: yes) não tem bloco correspondente na seção EXPERIÊNCIA.",
    "claude_reply": "Apliquei os CHANGEs 1 a 9 <b>sem</b> exportar. MOTIVO: o CHANGE 4 (mandatory: yes) não tem bloco "
                    "correspondente na seção EXPERIÊNCIA. NÃO EXPORTADO",
    "doubts": [],
    "options": [{"key": "claude", "label": "Refazer só a edição no Claude",
                 "description": "Reaproveita o patch do ChatGPT desta tentativa e abre uma tarefa nova no painel."},
                {"key": "chatgpt", "label": "Refazer o patch no ChatGPT",
                 "description": "Pede um patch novo ao ChatGPT e depois edita e exporta no Claude."}],
    "note_allowed": True,
}
STAGES = {
    "BUSCAR_VAGAS": [("busca", "Busca ampla e prefilter (Lince)"), ("analise", "Análise (Threadgist)"),
                     ("writeset", "Writeset pronto"), ("registro", "Registro na planilha")],
    "GERAR_CURRICULO": [("cverino", "CVerino + ChatGPT (patch editorial)"),
                        ("curriculinho", "Curriculinho (cópia do MASTER no Claude Design)"),
                        ("cv", "Currículo registrado (cv.pdf + cv.json)")],
    "PREENCHER_CANDIDATURA": [("claim", "Claim e preflight"), ("preenchimento", "Preenchimento do formulário"),
                              ("revisao", "Revisão e gate"), ("aprovacao", "Aguardando sua aprovação")],
    # Host path (Claude in Chrome), only for HOST_APPLY: the dispatch ends asking the user to paste the prompt.
    "PREENCHER_HOST": [("preflight", "Preflight (dossier e estado)"), ("cv", "Currículo (gera se faltar)"),
                       ("open", "Página da vaga aberta (Chrome application)"),
                       ("paste", "Cole o prompt no Claude in Chrome")],
    "LOCALIZAR_VAGA": [("localizar", "Localizar a vaga (Lince)"), ("prefilter", "Análise preliminar (prefilter)")],
    "ANALISAR_INDICADA": [("posting", "Texto da vaga e planilha (só leitura)"),
                          ("analise", "Análise no ChatGPT (host)"), ("writeset", "Writeset pronto"),
                          ("registro", "Registro na planilha")],
    "EDITAR_CURRICULO": [("pedido", "Pedido de edição (seu texto, sem ChatGPT)"),
                         ("claude", "Edição no Claude in Chrome"), ("cv", "Currículo novo registrado")],
    "ANALISAR_DESCOBERTA": [("posting", "Texto da vaga"), ("analise", "Análise no ChatGPT (host)"),
                            ("writeset", "Writeset pronto"), ("registro", "Registro na planilha")],
    "ANALISAR_VAGA": [("planilha", "Dados da vaga (planilha, só leitura)"), ("posting", "Texto da vaga"),
                      ("analise", "Análise no ChatGPT (host)"), ("writeset", "Writeset pronto"),
                      ("registro", "Registro na planilha")],
}
REGISTER = "REGISTRAR_WRITESET"
# "Preencher vaga" of this job on Hermes follows the host path (the others keep the Candidatinho stages): it ends in
# PRECISA_HUMANO/PASTE_PROMPT_IN_CLAUDE, and a "Pedir edição" finished afterwards makes the prompt stale.
HOST_APPLY = "fake-1007"
# fake-9001 is not in the fixture Sheet: the registration stage stays open until the panel persists it.
WRITESET_JOB_IDS = {"BUSCAR_VAGAS": ["fake-1001", "fake-9001"], "ANALISAR_INDICADA": ["fake-9002"]}
LOCATED = {"found": True, "reason": None, "already_in_registry": False, "posting": True,
           "job": {"title": "Estágio em Processos Químicos", "company": "Empresa Indicada", "location": "Camaçari, BA",
                   "url": "https://exemplo.com/vagas/9002", "source": "Gupy", "job_id": "fake-9002"},
           "prefilter": {"verdict": "BLOQUEIO_GRAVE", "reasons": ["pede formatura até 12/2026"]}}
NOT_FOUND = {"found": False, "reason": "nenhuma vaga com essa descrição", "already_in_registry": False,
             "job": None, "prefilter": None, "posting": False,
             "candidates": [{"title": "Engenheiro Químico", "company": "Empresa Indicada", "location": "Cubatão, SP",
                             "url": "https://exemplo.com/vagas/9101", "source": "Gupy", "job_id": None},
                            {"title": "Inspetor Dimensional", "company": "Empresa Indicada", "location": "Cubatão, SP",
                             "url": "javascript:alert(1)", "source": "Gupy", "job_id": None}]}
COMPLEMENT = "\n\nComplemento:\n"
DIAGNOSIS = [{"job_id": "fake-9002", "cargo": "Estágio em Processos Químicos", "empresa": "Empresa Indicada",
              "status_analise": "SELECIONADA", "interesse": "ALTO",
              "motivo_analise": "Gate 4 aprovado: <b>núcleo</b> de processos químicos com evidência direta"}]
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
    stages = STAGES["PREENCHER_HOST" if rec.get("host_apply") else rec["action"]]
    step = rec["step"]
    last = last_step(rec["action"])
    not_found = rec["action"] == "LOCALIZAR_VAGA" and not rec["found"] and step >= last
    out_stages = []
    for i, (key, label) in enumerate(stages):
        state = "done" if i < step else "active" if i == step and rec["status"] == "RODANDO" else "pending"
        if i == step and rec["status"] in ("PRECISA_HUMANO", "FALHOU") and rec["action"] in HOST_ANALYSES:
            state = "failed"
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
        progress.update(percent=5 + round(95 * done / len(stages)),
                        writeset_job_ids=WRITESET_JOB_IDS.get(rec["action"]) or [rec["job_id"]],
                        writeset_path=f"runtime/operations/"
                                      f"{rec['source_id'] if rec['action'] == 'ANALISAR_INDICADA' else rec['id']}/writeset.md",
                        registration={"id": reg["id"], "status": reg["status"], "code": None,
                                      "result": RESULT if reg["status"] == "CONCLUIDO" else None} if reg else None)
        if rec["action"] == "BUSCAR_VAGAS":
            progress.update(candidates=2, excluded=len(LEFT_OUT["excluded"]), excluded_jobs=LEFT_OUT["excluded"],
                            deferred_jobs=LEFT_OUT["deferred"])
        elif rec["action"] == "ANALISAR_VAGA":
            progress["diagnosis"] = [{**DIAGNOSIS[0], "job_id": rec["job_id"], "cargo": "", "empresa": "",
                                      "status_analise": "NÃO PRIORIZADA", "interesse": "MÉDIO"}]
            progress["diagnosis_by"] = "chatgpt"
        elif rec["action"] == "ANALISAR_DESCOBERTA":
            progress["diagnosis"] = [{**DIAGNOSIS[0], "job_id": rec["job_id"], "cargo": "Estagiário de Processos",
                                      "empresa": "Empresa de Fora", "status_analise": "DESCARTADA",
                                      "interesse": "BAIXO", "motivo_analise": "Gate 1: vaga de estágio."}]
            progress["diagnosis_by"] = "chatgpt"
        else:
            progress["diagnosis"] = DIAGNOSIS
            progress["diagnosis_by"] = "chatgpt"
    out = {k: rec[k] for k in ("id", "action", "platform", "job_id", "status", "acknowledged", "created_at")}
    if rec["action"] in ("LOCALIZAR_VAGA", "ANALISAR_INDICADA"):
        out.update(source_id=rec.get("source_id"), discarded=bool(rec.get("discarded")))
    if rec["action"] == "ANALISAR_DESCOBERTA":
        out["source_id"] = rec.get("source_id")
    if rec["action"] == "LOCALIZAR_VAGA":
        out.update(refines=rec.get("refines"), refined_by=rec.get("refined_by"))
    out.update(code=rec.get("code"), marker=rec.get("code"), turns=step, updated_at=rec["created_at"], delivered_at=rec["created_at"],
               finished_at=None if rec["status"] == "RODANDO" else rec["created_at"],
               bot=BOTS[rec["action"]][1 if rec["platform"] == "grok" else 0],
               active=rec["status"] == "RODANDO", progress=progress)
    if rec["action"] in HOST_ANALYSES or rec.get("mode") == "host":
        out["mode"] = "host"
    if rec["action"] == "EDITAR_CURRICULO":
        progress.update(edit_request=rec["edit_request"], edit_output="curriculo_igor-fernandes_pt_fake-v2.pdf")
        if step == 0:
            out_stages[0]["state"] = "done"   # o pedido já está gravado
    if rec.get("host_apply") and rec["status"] == "PRECISA_HUMANO":
        out_stages[-1].update(state="active", note="ação sua: abrir o painel do Claude na aba e colar")
        # Newest first: the records before this one were started after it.
        newer = list(recs)[: list(recs).index(rec)] if rec in recs else []
        stale = any(r["job_id"] == rec["job_id"] and r["action"] == "EDITAR_CURRICULO" and r["status"] == "CONCLUIDO"
                    for r in newer)
        progress.update(stage="paste", claude_url="https://exemplo.com/candidatura/1007", prompt_stale=stale,
                        claude_prompt="Você vai preencher a candidatura da vaga abaixo nesta aba do navegador.\n"
                                      "CURRÍCULO: anexe exatamente o arquivo /fake/curriculo_igor-fernandes_pt_fake.pdf")
    if rec["action"] == "GERAR_CURRICULO":
        out.update(resumes=rec.get("resumes"), resume_option=rec.get("resume_option"),
                   retried_by=rec.get("retried_by"))
        stuck = rec["status"] == "PRECISA_HUMANO" and not rec.get("retried_by")
        progress["recovery"] = RECOVERY if stuck else None
        if rec["status"] == "PRECISA_HUMANO":
            out_stages[1].update(state="failed", note="CLAUDE_STOPPED_WITHOUT_PDF")
    if rec["status"] == "MANUAL":
        out["command"] = f"[painel:dispatch {rec['id']} · {rec['action']}]\n\nComando fixo de teste." + (
            f" python3 hermes/browsers/cv_claude_chrome.py edit {rec['job_id']} --op-dir runtime/operations/{rec['id']}"
            if rec["action"] == "EDITAR_CURRICULO" else "")
    return out


def cv_done(recs, job_id):
    return any(r["job_id"] == job_id and r["action"] == "GERAR_CURRICULO" and r["status"] == "CONCLUIDO" for r in recs)


def refuse(code, detail=""):
    print(json.dumps({"ok": False, "code": code, "detail": detail}))
    return 1


def flag(argv, name):
    return argv[argv.index(name) + 1] if name in argv else None


def main(argv):
    cmd = argv[0]
    recs = load()
    if cmd == "start":
        action, platform = argv[1], flag(argv, "--platform")
        job_id, source_id = flag(argv, "--job-id"), flag(argv, "--from")
        if action in HERMES_ONLY and platform != "hermes":
            return refuse("PLATFORM_NOT_SUPPORTED")
        if any(r["action"] == action and r["job_id"] == job_id and r["status"] == "RODANDO" for r in recs):
            return refuse("DISPATCH_ACTIVE")
        if action in HOST_ANALYSES and any(
                r["action"] in CHATGPT_HOST and r["status"] == "RODANDO" for r in recs):
            return refuse("CHATGPT_BUSY")
        if action in LINCE and any(r["action"] in LINCE and r["status"] == "RODANDO" for r in recs):
            return refuse("PROFILE_BUSY")
        holder = next((r for r in recs if action == "PREENCHER_CANDIDATURA" and r["action"] == action
                       and r["status"] == "RODANDO" and r["job_id"] != job_id), None)
        if holder:
            return refuse("APPLICATION_DISPATCH_ACTIVE", holder["job_id"])   # one application at a time
        if action == "PREENCHER_CANDIDATURA" and platform == "hermes" and job_id == "fake-1010":
            return refuse("APPLICATION_CDP_DOWN")   # Chrome da candidatura fechado: o toast oferece abrir
        if action in ("GERAR_CURRICULO", "PREENCHER_CANDIDATURA") and job_id == "fake-1005":
            return refuse("DOSSIER_NOT_VALID")   # nunca analisada: nem dossier local nem análise salva
        n = len(recs) + 1
        rec = {"id": f"d-20260929T12{n:04d}Z-abcdef", "action": action, "platform": platform, "job_id": job_id,
               "status": "MANUAL" if platform == "grok" else "RODANDO", "step": 0, "acknowledged": False,
               "created_at": now()}
        if action == "GERAR_CURRICULO" and platform == "hermes":
            rec["mode"] = "host"
        if action == "PREENCHER_CANDIDATURA" and platform == "hermes" and job_id == HOST_APPLY:
            rec.update(mode="host", host_apply=True)
        if action == "LOCALIZAR_VAGA":
            text = sys.stdin.read() if "--intake-stdin" in argv else ""
            candidate = flag(argv, "--candidate")
            if APPROVAL_RE.search(text):
                return refuse("INTAKE_LOOKS_LIKE_APPROVAL")
            origin = None
            if source_id:
                # Complement of a NEEDS_CONTEXT intake: a candidate (1..n) or the "Outro" text.
                origin = next((r for r in recs if r["id"] == source_id), None)
                code = ("DISPATCH_NOT_FOUND" if origin is None
                        else "NOT_AN_INTAKE" if origin["action"] != "LOCALIZAR_VAGA"
                        else "DISCARDED" if origin.get("discarded")
                        else "INTAKE_ALREADY_REFINED" if origin.get("refined_by")
                        else "INTAKE_NOT_REFINABLE" if origin.get("code") != "NEEDS_CONTEXT"
                        else "INTAKE_INVALID" if (candidate is None) == (text == "")
                        else "CANDIDATE_INVALID" if candidate is not None
                        and not 1 <= int(candidate) <= len(NOT_FOUND["candidates"]) else None)
                if code:
                    return refuse(code)
                if candidate is not None:
                    c = NOT_FOUND["candidates"][int(candidate) - 1]
                    text = f"Escolhida no painel entre as candidatas: {c['title']} · {c['company']}"
                elif not 10 <= len(text):
                    return refuse("INTAKE_INVALID")
                text = origin["intake_text"] + COMPLEMENT + text
                if len(text) > 1500:
                    return refuse("INTAKE_TOO_LONG")
            if not 10 <= len(text) <= 1500:
                return refuse("INTAKE_INVALID")
            # A complement always locates the job in the fake.
            rec.update(intake_text=text, found=origin is not None or "nao-existe" not in text.lower(),
                       discarded=False)
            if origin is not None:
                rec["refines"] = origin["id"]
                origin.update(refined_by=rec["id"], acknowledged=True)
        if action == "EDITAR_CURRICULO":
            text = sys.stdin.read() if "--request-stdin" in argv else ""
            if not 10 <= len(text.strip()) <= 1500:
                return refuse("REQUEST_INVALID")
            if APPROVAL_RE.search(text):
                return refuse("REQUEST_LOOKS_LIKE_APPROVAL")
            if any(r["action"] in ("GERAR_CURRICULO", "EDITAR_CURRICULO") and r["status"] == "RODANDO" for r in recs):
                return refuse("CV_DOC_BUSY")
            if not cv_done(recs, job_id):
                return refuse("CV_NOT_READY")
            rec.update(edit_request=text.strip(), mode="host" if platform == "hermes" else "bot")
        if action == "ANALISAR_DESCOBERTA":
            search = next((r for r in recs if r["id"] == source_id), None)
            card = next((e for e in LEFT_OUT["excluded"] + LEFT_OUT["deferred"] if e["job_id"] == job_id), None)
            code = ("SOURCE_REQUIRED" if not source_id else "DISPATCH_NOT_FOUND" if search is None
                    else "SOURCE_NOT_A_SEARCH" if search["action"] != "BUSCAR_VAGAS"
                    else "NOT_LEFT_OUT" if card is None else "LEFT_OUT_WITHOUT_CARD" if not card["has_card"]
                    else "ALREADY_IN_RUNTIME" if card["in_runtime"] else None)
            if code:
                return refuse(code)
            rec.update(source_id=source_id)
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
                if rec["action"] == "ANALISAR_VAGA" and rec["job_id"] == NO_POSTING and rec["step"] >= 1:
                    rec.update(step=1, status="PRECISA_HUMANO", code="POSTING_UNAVAILABLE")
                elif (rec["action"] == "GERAR_CURRICULO" and rec["job_id"] == STUCK_CV and rec.get("mode") == "host"
                      and not rec.get("resumes") and rec["step"] >= 1):
                    rec.update(step=1, status="PRECISA_HUMANO",
                               code="BLOCKED_CLAUDE_CHROME:CLAUDE_STOPPED_WITHOUT_PDF")
                elif rec["step"] >= last_step(rec["action"]):
                    if rec.get("host_apply"):
                        rec.update(step=last_step(rec["action"]) - 1, status="PRECISA_HUMANO",
                                   code="PASTE_PROMPT_IN_CLAUDE")
                    elif rec["action"] == "LOCALIZAR_VAGA" and not rec["found"]:
                        rec.update(status="PRECISA_HUMANO", code="NEEDS_CONTEXT")
                    else:
                        rec["status"] = "CONCLUIDO"
        save(recs)
        shown = [r for r in recs if not r.get("deleted") and (job_id is None or r["job_id"] == job_id)
                 and (action is None or r["action"] == action)]
        out = {"ok": True, "gateway": "running", "dispatches": [view(r, recs) for r in shown[:5]]}
        if job_id is not None:
            ready = cv_done(recs, job_id)
            out["job"] = {"job_id": job_id, "dossier": "VALID", "actionable": True, "cv_allowed": True,
                          "cv": "VALID" if ready else "MISSING", "application_state": None}
        print(json.dumps(out))
        return 0
    if cmd == "resume-cv":
        origin = next((r for r in recs if r["id"] == argv[1]), None)
        option = flag(argv, "--option")
        note = sys.stdin.read().strip() if "--note-stdin" in argv else None
        code = ("OPTION_INVALID" if option not in ("claude", "chatgpt")
                else "NOTE_NOT_EXPECTED" if note is not None and option != "chatgpt"
                else "INTAKE_LOOKS_LIKE_APPROVAL" if note and APPROVAL_RE.search(note)
                else "INTAKE_INVALID" if note is not None and (not 10 <= len(note) <= 1500 or MARKERS_RE.search(note))
                else "DISPATCH_NOT_FOUND" if origin is None
                else "ALREADY_RESUMED" if origin.get("retried_by")
                else "NOT_RESUMABLE" if origin["action"] != "GERAR_CURRICULO" or origin["status"] != "PRECISA_HUMANO"
                else None)
        if code:
            return refuse(code)
        rec = {"id": f"d-20260929T14{len(recs) + 1:04d}Z-abcdef", "action": "GERAR_CURRICULO", "platform": "hermes",
               "job_id": origin["job_id"], "status": "RODANDO", "step": 0, "acknowledged": False,
               "created_at": now(), "mode": "host", "resumes": origin["id"], "resume_option": option,
               "note": note}
        origin.update(retried_by=rec["id"], acknowledged=True)
        recs.insert(0, rec)
        save(recs)
        print(json.dumps({"ok": True, "dispatch": view(rec, recs)}))
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
    if cmd == "delete":
        rec = next((r for r in recs if r["id"] == argv[1]), None)
        if rec is None:
            return refuse("DISPATCH_NOT_FOUND")
        if rec["action"] not in ("LOCALIZAR_VAGA", "ANALISAR_INDICADA"):
            return refuse("NOT_AN_INTAKE")
        # Whole lineage: intakes linked by refines/refined_by, their analyses and registrations.
        lineage, todo = {}, [intake_of(rec, recs)["id"]]
        while todo:
            wanted = todo.pop()
            current = next((r for r in recs if r["id"] == wanted), None)
            if current is not None and current["id"] not in lineage:
                lineage[current["id"]] = current
                todo += [current.get("refines"), current.get("refined_by")]
        analyses = [r for r in recs if r["action"] == "ANALISAR_INDICADA" and r["source_id"] in lineage]
        regs = [r for r in recs if r["action"] == REGISTER and r["source_id"] in {a["id"] for a in analyses}]
        chain = list(lineage.values()) + analyses + regs
        if any(r["status"] == "RODANDO" for r in chain):
            return refuse("DISPATCH_STILL_RUNNING")
        if any(r["status"] == "CONCLUIDO" for r in regs):
            return refuse("ALREADY_REGISTERED")
        for r in chain:
            r.update(deleted=True, discarded=True, acknowledged=True)
        save(recs)
        print(json.dumps({"ok": True, "delete": {"id": rec["id"], "deleted": [r["id"] for r in chain]}}))
        return 0
    if cmd == "decline":
        job_id = argv[1] if len(argv) > 1 else ""
        if not JOB_ID_RE.match(job_id):
            return refuse("INVALID_JOB_ID")
        if job_id == "fake-1006":
            return refuse("ALREADY_SENT")
        print(json.dumps({"ok": True, "decline": {"job_id": job_id, "status_candidatura": "RETIRADA"}}))
        return 0
    if cmd == "cv-file":
        # The résumé of a job whose GERAR_CURRICULO finished: a tiny real PDF in the fake state dir (like cv.json VALID).
        job_id = argv[1] if len(argv) > 1 else ""
        if not JOB_ID_RE.match(job_id):
            return refuse("JOB_ID_INVALID")
        if not cv_done(recs, job_id):
            print(json.dumps({"ok": False, "code": "CV_NOT_VALID", "detail": "CV_JSON_MISSING"}))
            return 1
        # A finished "Pedir edição" leaves a new PDF (-v2, other bytes) as the registered résumé.
        edited = any(r["job_id"] == job_id and r["action"] == "EDITAR_CURRICULO" and r["status"] == "CONCLUIDO"
                     for r in recs)
        body = FAKE_PDF + (b"%editado\n" if edited else b"")
        pdf = STATE.parent / "curriculos" / f"curriculo_igor-fernandes_pt_fake{'-v2' if edited else ''}.pdf"
        pdf.parent.mkdir(parents=True, exist_ok=True)
        pdf.write_bytes(body)
        print(json.dumps({"ok": True, "cv_file": {
            "job_id": job_id, "path": str(pdf), "filename": pdf.name, "size": len(body),
            "sha256": hashlib.sha256(body).hexdigest(), "exported_at": "2026-10-03T12:00:00Z"}}))
        return 0
    if cmd == "record-sent":
        # Writes nothing: answers like `application.py record-panel-submit` (fake-1006, sent in the fixture, is refused).
        job_id = argv[1] if len(argv) > 1 else ""
        evidence = argv[3] if len(argv) > 3 and argv[2] == "--evidence" else ""
        if not JOB_ID_RE.match(job_id):
            return refuse("INVALID_JOB_ID")
        if evidence not in ("SUCCESS_PAGE", "PORTAL_SHOWS_APPLIED", "ATS_EMAIL_CONFIRMATION"):
            return refuse("EVIDENCE_INVALID")
        if job_id == "fake-1006":
            return refuse("ALREADY_SENT")
        print(json.dumps({"ok": True, "record_sent": {"job_id": job_id, "status_candidatura": "ENVIADA"}}))
        return 0
    if cmd == "mark-closed":
        job_id = argv[1] if len(argv) > 1 else ""
        if not JOB_ID_RE.match(job_id):
            return refuse("INVALID_JOB_ID")
        if job_id == "fake-1005":
            return refuse("DOSSIER_NOT_VALID")
        print(json.dumps({"ok": True, "mark_closed": {"job_id": job_id, "status_disponibilidade": "ENCERRADA",
                                                      "sheet": "UPDATED"}}))
        return 0
    if cmd == "confirm-open":
        job_id = argv[1] if len(argv) > 1 else ""
        if not JOB_ID_RE.match(job_id):
            return refuse("INVALID_JOB_ID")
        if job_id == "fake-1005":
            return refuse("DOSSIER_NOT_VALID")
        print(json.dumps({"ok": True, "confirm_open": {"job_id": job_id, "status_disponibilidade": "ABERTA",
                                                       "sheet": "UPDATED"}}))
        return 0
    if cmd == "open-browser":
        # Opens nothing: says the Cloud Design Chrome is up, like `native_profiles.sh open` + `check` on the host.
        browser = argv[1] if len(argv) > 1 else ""
        if browser not in ("clouddesign", "application"):
            return refuse("BROWSER_INVALID")
        print(json.dumps({"ok": True, "open_browser": {"browser": browser, "already_open": False}}))
        return 0
    if cmd == "delete-job":
        job_id = argv[1] if len(argv) > 1 else ""
        if not JOB_ID_RE.match(job_id):
            return refuse("INVALID_JOB_ID")
        if job_id == "fake-1006":
            return refuse("ALREADY_SENT")
        if job_id == "fake-1002":
            return refuse("DELETE_PARTIAL")
        print(json.dumps({"ok": True, "delete_job": {"job_id": job_id, "principal": 1, "eventos": 2, "dossiers": 1}}))
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
