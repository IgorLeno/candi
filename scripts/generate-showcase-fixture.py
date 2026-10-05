#!/usr/bin/env python3
"""Generate the showcase snapshot used for the README screenshots.

Same contract code as ``generate-job-search-fixture.py`` (dossier rows go
through job-search's ``dossier.transport_row`` and ``writeset.decode_dossier_row``),
but without the error cases that fixture keeps on purpose for the tests:
every dossier is valid, no send is uncertain, nothing diverges and no value is
outside the domain. All data is fictitious. Never write this over
``lib/job-search/fixtures/snapshot.json``: the tests depend on the error cases.

Usage (in a scratch copy of the repo, see docs/plans/2026-10-05-candi-readme-portfolio.md):
    python3 scripts/generate-showcase-fixture.py ../../job-search > <copy>/lib/job-search/fixtures/snapshot.json
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

# sheet_row, job and from_dossier are the same as in generate-job-search-fixture.py, which builds its
# snapshot at import time and so cannot be imported.


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
base_analysis = tf.dossier_facts()["analysis"]


def d(job_id, empresa, cargo, captured, *, familia="PROCESSOS_ENGENHARIA", tipo="REGULAR", prox="DIRETA",
      setor="MINERACAO_MINERAIS", loc=("Belo Horizonte", "MG", "PRESENCIAL"), avail="ABERTA",
      status="SELECIONADA", gate="", model="ATTACHMENT", core=None):
    ident = {**tf.dossier_facts(job_id)["identity"], "empresa": empresa, "cargo": cargo}
    analysis = {**base_analysis, "status_analise": status, "gate_decisivo": gate}
    if core:
        analysis["core_sentence"] = core
    return tf.built_dossier(
        job_id, captured_at=captured, identity=ident,
        availability={"status": avail, "checked_at": captured},
        location={"municipio": loc[0], "uf": loc[1], "modalidade": loc[2]},
        analysis=analysis,
        classification={"familia_funcao": familia, "tipo_programa": tipo, "proximidade_eq": prox, "setor": setor},
        application={"model_hint": model, "hint_source": "PORTAL_NOTES"},
    )


dossiers = {
    "fake-1001": d("fake-1001", "Mineradora Exemplo", "Analista de Processos Júnior", "2026-09-24T10:00:00Z"),
    "fake-1002": d("fake-1002", "Química Exemplo", "Analista de Dados Júnior", "2026-09-29T10:00:00Z",
                   familia="DADOS_BI", prox="CONTEXTUAL", setor="QUIMICA_PETROQUIMICA",
                   loc=("São Paulo", "SP", "HIBRIDO"), core="construir dashboards e automatizar relatórios de produção"),
    "fake-1003": d("fake-1003", "Energia Exemplo", "Engenheiro de Processos Trainee", "2026-09-30T10:00:00Z",
                   tipo="TRAINEE", setor="ENERGIA", loc=("Campinas", "SP", "PRESENCIAL")),
    "fake-1004": d("fake-1004", "Alimentos Exemplo", "Analista de Qualidade Júnior", "2026-10-01T10:00:00Z",
                   familia="LABORATORIO_QUALIDADE", prox="CORRELATA", setor="ALIMENTOS",
                   loc=("Contagem", "MG", "PRESENCIAL")),
    "fake-1005": d("fake-1005", "Logística Exemplo", "Assistente Administrativo", "2026-09-08T10:00:00Z",
                   familia="DADOS_BI", prox="CONTEXTUAL", setor="OUTRO", status="DESCARTADA", gate="G1"),
    "fake-1006": d("fake-1006", "Papel Exemplo", "Analista de Processos Júnior", "2026-09-02T10:00:00Z",
                   setor="PAPEL_CELULOSE", loc=("Três Lagoas", "MS", "PRESENCIAL"), model="PROFILE_BASED"),
    "fake-1007": d("fake-1007", "Siderurgia Exemplo", "Analista de BI Júnior", "2026-09-17T10:00:00Z",
                   familia="DADOS_BI", prox="CONTEXTUAL", setor="OUTRO", loc=("Ipatinga", "MG", "HIBRIDO"),
                   core="manter dashboards de produção e automatizar indicadores"),
    "fake-1008": d("fake-1008", "Cosméticos Exemplo", "Analista de Laboratório Júnior", "2026-09-22T10:00:00Z",
                   familia="LABORATORIO_QUALIDADE", prox="CORRELATA", setor="QUIMICA_PETROQUIMICA",
                   avail="NÃO CONFIRMADA"),
    "fake-1009": d("fake-1009", "Mineração Exemplo", "Estágio em Engenharia Química", "2026-09-20T10:00:00Z"),
    "fake-1010": d("fake-1010", "Pagamentos Exemplo", "Analista de Dados Júnior", "2026-09-10T10:00:00Z",
                   familia="DADOS_BI", prox="CONTEXTUAL", setor="OUTRO", avail="ENCERRADA", status="NÃO PRIORIZADA"),
    "fake-0999": d("fake-0999", "Celulose Exemplo", "Engenheiro de Processos Júnior", "2026-08-25T10:00:00Z",
                   setor="PAPEL_CELULOSE", avail="ENCERRADA"),
}


def row(job_id, **fields):
    dz = dossiers[job_id]
    first = dz["captured_at"][:10]
    return from_dossier(dz, data_primeira_analise=first, data_ultima_analise=first, **fields)


main_rows = [
    row("fake-1001", status_candidatura="EM PREPARAÇÃO"),
    row("fake-1002"),
    row("fake-1003", status_candidatura="PRONTA PARA REVISÃO"),
    row("fake-1004"),
    row("fake-1005"),
    row("fake-1006", status_candidatura="ENVIADA", data_candidatura="2026-09-03", portal_candidatura="Gupy"),
    row("fake-1007", status_candidatura="ENVIADA", data_candidatura="2026-10-05"),
    row("fake-1008"),
    row("fake-1009", status_candidatura="RETIRADA"),
    row("fake-1010"),
]
archived_rows = [row("fake-0999")]

events = [
    ["fake-1006", "fake-1006:1", "CLAIMED", "2026-09-02T12:00:00Z", "", "", ""],
    ["fake-1006", "fake-1006:1", "DRAFT_CONFIRMED", "2026-09-02T12:05:00Z", "", "", "PORTAL_DRAFT"],
    ["fake-1006", "fake-1006:1", "SUBMIT_INTENT", "2026-09-03T09:00:00Z", "CONFIRM", "a1b2c3d4", ""],
    ["fake-1006", "fake-1006:1", "SUBMITTED", "2026-09-03T09:00:30Z", "CONFIRM", "a1b2c3d4", "SUCCESS_PAGE"],
    ["fake-1007", "fake-1007:1", "CLAIMED", "2026-10-05T10:00:00Z", "", "", ""],
    ["fake-1007", "fake-1007:1", "SUBMIT_INTENT", "2026-10-05T10:30:00Z", "CONFIRM", "0badc0de", ""],
    ["fake-1007", "fake-1007:1", "SUBMITTED", "2026-10-05T10:30:30Z", "CONFIRM", "0badc0de", "SUCCESS_PAGE"],
    ["fake-1001", "fake-1001:1", "CLAIMED", "2026-09-24T11:00:00Z", "", "", ""],
    ["fake-1009", "fake-1009:1", "CLOSED", "2026-09-25T14:00:00Z", "", "", "USER_DECLINED"],
]

coverage = [
    ["2026-09-10", "LinkedIn", "Tier A", "Agregador", "OK", ""],
    ["2026-09-10", "Gupy", "Tier B", "ATS", "OK", ""],
    ["2026-09-24", "LinkedIn", "Tier A", "Agregador", "OK", ""],
    ["2026-09-24", "Gupy", "Tier B", "ATS", "SEM RESULTADOS RELEVANTES", ""],
    ["2026-10-01", "LinkedIn", "Tier A", "Agregador", "OK", ""],
    ["2026-10-01", "Gupy", "Tier B", "ATS", "OK", ""],
]

snapshot = {
    "generated_by": "scripts/generate-showcase-fixture.py (README screenshots only)",
    "tabs": {
        "Registro": [list(sc.MAIN_COLUMNS)] + [[r[n] for n in sc.MAIN_COLUMNS] for r in main_rows],
        "Encerradas": [list(sc.MAIN_COLUMNS)] + [[r[n] for n in sc.MAIN_COLUMNS] for r in archived_rows],
        sc.EVENTS_TAB: [list(sc.EVENT_COLUMNS)] + events,
        sc.COVERAGE_TAB: [list(sc.COVERAGE_COLUMNS)] + coverage,
        sc.ALLOWED_TAB: sc.allowed_values_rows(),
        sc.DOSSIERS_TAB: [list(sc.DOSSIER_COLUMNS)] + [sheet_row(dz, posting) for dz in dossiers.values()],
    },
}
json.dump(snapshot, sys.stdout, ensure_ascii=False, indent=1)
sys.stdout.write("\n")
