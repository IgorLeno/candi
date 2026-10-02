#!/usr/bin/env python3
"""Generate the dashboard fixture snapshot from the job-search contract code.

Dossier rows go through job-search's own ``dossier.transport_row`` and
``writeset.decode_dossier_row``, so the fixture matches the real `Dossiers`
tab byte for byte. All data is fictitious (job-search ``testing_fixtures``).

Usage:
    python3 scripts/generate-job-search-fixture.py ../../job-search > lib/job-search/fixtures/snapshot.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

job_search = Path(sys.argv[1] if len(sys.argv) > 1 else "../../job-search").resolve()
sys.path.insert(0, str(job_search / "scripts"))

import dossier as ds  # noqa: E402
import sheets_client as sc  # noqa: E402
import testing_fixtures as tf  # noqa: E402
import writeset as ws  # noqa: E402


def sheet_row(dossier: dict, posting: str) -> list[str]:
    errors = ds.validate(dossier, posting)
    if errors:
        raise SystemExit(f"fixture dossier invalid: {errors}")
    row, _, errors = ws.decode_dossier_row(ds.transport_row(dossier, posting))
    if errors:
        raise SystemExit(f"fixture transport invalid: {errors}")
    return row


def job(job_id: str, **fields: str) -> dict[str, str]:
    base = {
        "job_id": job_id,
        "empresa": "Empresa Exemplo",
        "cargo": "Estágio em Engenharia Química",
        "url": f"https://jobs.example.invalid/{job_id}",
        "fonte": "LinkedIn",
        "fonte_descoberta": "LinkedIn",
        "portal_candidatura": "LinkedIn Easy Apply",
        "familia_funcao": "NAO_CLASSIFICADO",
        "tipo_programa": "NAO_CLASSIFICADO",
        "proximidade_eq": "NAO_CLASSIFICADO",
        "setor": "NAO_CLASSIFICADO",
        "interesse": "NAO_CLASSIFICADO",
        "application_model": "UNKNOWN",
        "data_primeira_analise": "2026-09-01",
        "data_ultima_analise": "2026-09-01",
        "status_analise": "NÃO PRIORIZADA",
        "status_disponibilidade": "NÃO CONFIRMADA",
        "motivo_analise": "",
        "gate_decisivo": "",
        "status_candidatura": "NÃO INICIADA",
        "data_candidatura": "",
        "observacoes": "",
        "origem_skill": "cotar-vagas",
    }
    base.update(fields)
    return base


def from_dossier(dossier: dict, **fields: str) -> dict[str, str]:
    """Main-tab row consistent with the dossier (as JOB_UPSERTS would write it)."""
    identity, classification = dossier["identity"], dossier["classification"]
    consistent = {
        "empresa": identity["empresa"],
        "cargo": identity["cargo"],
        "url": identity["url"],
        "fonte": identity["fonte"],
        "fonte_descoberta": identity["fonte"],
        "portal_candidatura": identity["portal"],
        "interesse": dossier["interest"]["level"],
        "application_model": dossier["application"]["model_hint"],
        "status_analise": dossier["analysis"]["status_analise"],
        "status_disponibilidade": dossier["availability"]["status"],
        **{key: classification[key] for key in ("familia_funcao", "tipo_programa", "proximidade_eq", "setor")},
    }
    return job(dossier["job_id"], **{**consistent, **fields})


posting = tf.POSTING
long_posting = posting + "\n" + ("Texto adicional fictício da publicação. " * 1300)

full = tf.built_dossier("fake-1001")
full_old = tf.built_dossier("fake-1001", captured_at="2026-09-10T09:00:00Z")
truncated = tf.built_dossier("fake-1002", posting=long_posting, captured_at="2026-09-15T10:00:00Z")
divergent = tf.built_dossier(
    "fake-1003",
    captured_at="2026-09-16T10:00:00Z",
    classification={
        "familia_funcao": "PD_MODELAGEM",
        "tipo_programa": "TRAINEE",
        "proximidade_eq": "CORRELATA",
        "setor": "QUIMICA_PETROQUIMICA",
    },
    location={"municipio": "São Paulo", "uf": "SP", "modalidade": "HIBRIDO"},
)
tampered_source = tf.built_dossier("fake-1004", captured_at="2026-09-17T10:00:00Z")

tampered = sheet_row(tampered_source, posting)
tampered[sc.DOSSIER_COLUMNS.index("dossier_sha256")] = "0" * 64

main_rows = [
    from_dossier(full, data_primeira_analise="2026-09-10", data_ultima_analise="2026-09-24",
                 status_candidatura="EM PREPARAÇÃO"),
    from_dossier(truncated, data_primeira_analise="2026-09-15", data_ultima_analise="2026-09-15"),
    from_dossier(divergent, data_primeira_analise="2026-09-16", data_ultima_analise="2026-09-16",
                 interesse="BAIXO", status_candidatura="PRONTA PARA REVISÃO"),
    from_dossier(tampered_source, data_primeira_analise="2026-09-17", data_ultima_analise="2026-09-17"),
    job("fake-1005", data_primeira_analise="2026-08-20", data_ultima_analise="2026-08-20",
        status_analise="DESCARTADA", status_candidatura="NãO INICIADA", motivo_analise="histórica"),
    job("fake-1006", empresa="Química Exemplo", familia_funcao="PROCESSOS_ENGENHARIA", tipo_programa="REGULAR",
        proximidade_eq="DIRETA", setor="QUIMICA_PETROQUIMICA", interesse="ALTO", application_model="PROFILE_BASED",
        data_primeira_analise="2026-08-27", data_ultima_analise="2026-09-03", status_analise="SELECIONADA",
        status_disponibilidade="ABERTA", status_candidatura="ENVIADA", data_candidatura="2026-09-03",
        portal_candidatura="Gupy"),
    job("fake-1007", empresa="Energia Exemplo", familia_funcao="DADOS_BI", tipo_programa="REGULAR",
        proximidade_eq="CONTEXTUAL", setor="ENERGIA", interesse="NORMAL", application_model="ATTACHMENT",
        data_primeira_analise="2026-09-02", data_ultima_analise="2026-09-18", status_analise="SELECIONADA",
        status_disponibilidade="ABERTA", status_candidatura="EM PREPARAÇÃO"),
    job("fake-1008", empresa="Alimentos Exemplo", familia_funcao="LABORATORIO_QUALIDADE", tipo_programa="REGULAR",
        proximidade_eq="CORRELATA", setor="ALIMENTOS", interesse="NORMAL", data_primeira_analise="2026-09-22",
        data_ultima_analise="2026-09-22", status_analise="SELECIONADA", status_disponibilidade="NÃO CONFIRMADA"),
    # Discarded by the user from the panel (application.py decline): RETIRADA + CLOSED/USER_DECLINED.
    job("fake-1009", empresa="Mineração Exemplo", familia_funcao="PROCESSOS_ENGENHARIA", tipo_programa="REGULAR",
        proximidade_eq="DIRETA", setor="MINERACAO_MINERAIS", interesse="NORMAL", data_primeira_analise="2026-09-20",
        data_ultima_analise="2026-09-20", status_analise="SELECIONADA", status_disponibilidade="ABERTA",
        status_candidatura="RETIRADA"),
    # Marked ENCERRADA by a wrong automatic read (a Gupy id read as LinkedIn, 2026-10-02): the user may reopen it.
    job("fake-1010", empresa="Pagamentos Exemplo", familia_funcao="DADOS_BI", tipo_programa="REGULAR",
        proximidade_eq="CONTEXTUAL", setor="OUTRO", interesse="ALTO", data_primeira_analise="2026-09-23",
        data_ultima_analise="2026-09-23", status_analise="NÃO PRIORIZADA", status_disponibilidade="ENCERRADA",
        fonte="Gupy", fonte_descoberta="Gupy", portal_candidatura="Gupy"),
    job("", empresa="Linha sem job_id"),
]

archived_rows = [
    job("fake-0999", empresa="Papel Exemplo", familia_funcao="PROCESSOS_ENGENHARIA", tipo_programa="REGULAR",
        proximidade_eq="DIRETA", setor="PAPEL_CELULOSE", interesse="ALTO", data_primeira_analise="2026-08-18",
        data_ultima_analise="2026-08-25", status_analise="SELECIONADA", status_disponibilidade="ENCERRADA"),
]

events = [
    ["fake-1006", "fake-1006:1", "CLAIMED", "2026-09-02T12:00:00Z", "", "", ""],
    ["fake-1006", "fake-1006:1", "DRAFT_CONFIRMED", "2026-09-02T12:05:00Z", "", "", "PORTAL_DRAFT"],
    ["fake-1006", "fake-1006:1", "SUBMIT_INTENT", "2026-09-03T09:00:00Z", "CONFIRM", "a1b2c3d4", ""],
    ["fake-1006", "fake-1006:1", "SUBMITTED", "2026-09-03T09:00:30Z", "CONFIRM", "a1b2c3d4", "SUCCESS_PAGE"],
    ["fake-1001", "fake-1001:1", "CLAIMED", "2026-09-24T11:00:00Z", "", "", ""],
    ["fake-1007", "fake-1007:1", "CLAIMED", "2026-09-18T10:00:00Z", "", "", ""],
    ["fake-1007", "fake-1007:1", "SUBMIT_INTENT", "2026-09-18T10:30:00Z", "CONFIRM", "0badc0de", ""],
    ["fake-1009", "fake-1009:1", "CLOSED", "2026-09-25T14:00:00Z", "", "", "USER_DECLINED"],
]

coverage = [
    ["2026-09-10", "LinkedIn", "Tier A", "Agregador", "OK", ""],
    ["2026-09-10", "Gupy", "Tier B", "ATS", "SEM RESULTADOS RELEVANTES", ""],
    ["2026-09-17", "LinkedIn", "Tier A", "Agregador", "OK", ""],
    ["2026-09-17", "Carreiras Exemplo", "Tier C", "Carreiras da empresa / ATS", "LOGIN NECESSÁRIO", ""],
    ["2026-09-24", "LinkedIn", "Tier A", "Agregador", "CAPTCHA/BLOQUEIO", ""],
    ["2026-09-24", "Gupy", "Tier B", "ATS", "OK", ""],
]

# Physical column order is not part of the contract: shuffle it to exercise header lookup.
main_header = list(reversed(sc.MAIN_COLUMNS))

snapshot = {
    "generated_by": "scripts/generate-job-search-fixture.py (job-search testing_fixtures)",
    "tabs": {
        "Registro": [main_header] + [[row[name] for name in main_header] for row in main_rows],
        "Encerradas": [list(sc.MAIN_COLUMNS)] + [[row[name] for name in sc.MAIN_COLUMNS] for row in archived_rows],
        sc.EVENTS_TAB: [list(sc.EVENT_COLUMNS)] + events,
        sc.COVERAGE_TAB: [list(sc.COVERAGE_COLUMNS)] + coverage,
        sc.ALLOWED_TAB: sc.allowed_values_rows(),
        sc.DOSSIERS_TAB: [list(sc.DOSSIER_COLUMNS)]
        + [
            sheet_row(full_old, posting),
            sheet_row(full, posting),
            sheet_row(truncated, long_posting),
            sheet_row(divergent, posting),
            tampered,
        ],
    },
}

json.dump(snapshot, sys.stdout, ensure_ascii=False, indent=1)
sys.stdout.write("\n")
