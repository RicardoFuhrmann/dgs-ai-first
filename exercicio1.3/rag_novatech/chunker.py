"""Módulo de chunking semântico alinhado ao Anexo B de referência.

Estratégia:
1. Cada documento individual é processado separadamente.
2. Identifica seções (##) e subseções (###) do Markdown.
3. Seções de introdução (Objetivo, Escopo) são descartadas como chunks
   independentes — seu conteúdo é contexto, não informação operacional.
4. Cada seção/subseção operacional gera um chunk com metadados ricos.
5. Tabelas são preservadas integralmente dentro do chunk.
6. A tabela de SLAs (SLA-2024, seção 2) é dividida em dois chunks:
   chamados gerais e incidentes críticos, conforme o Anexo B.
7. O FAQ é dividido por item individual.
"""

import re
from dataclasses import dataclass, field
from typing import Optional

# Seções de introdução que não geram chunks independentes
INTRO_SECTIONS = {"objetivo", "escopo"}

DOCUMENT_METADATA = {
    "POL-001": {
        "document_type": "normativo",
        "version": "3.1",
        "is_informal_source": False,
    },
    "PROC-042": {
        "document_type": "procedimento",
        "version": "1.0",
        "is_informal_source": False,
    },
    "PROC-042-v2": {
        "document_type": "procedimento",
        "version": "2.0",
        "is_informal_source": False,
    },
    "SLA-2024": {
        "document_type": "contratual",
        "version": "2024.1",
        "is_informal_source": False,
    },
    "FAQ-Atendimento": {
        "document_type": "faq",
        "version": "não controlada",
        "is_informal_source": True,
    },
}


@dataclass
class Chunk:
    chunk_id: str
    text: str
    source_document: str
    section: str
    title: str
    document_type: str
    version: str
    is_informal_source: bool
    metadata: dict = field(default_factory=dict)


def _split_by_headers(content: str, level: str = "##") -> list[tuple[str, str]]:
    """Divide conteúdo por cabeçalhos Markdown do nível especificado."""
    pattern = re.compile(rf"^({re.escape(level)}\s+.+)$", re.MULTILINE)
    parts = pattern.split(content)
    sections = []
    i = 1
    while i < len(parts):
        header = parts[i].strip()
        body = parts[i + 1] if i + 1 < len(parts) else ""
        sections.append((header, body.strip()))
        i += 2
    return sections


def _is_intro_section(header: str) -> bool:
    """Verifica se a seção é de introdução (Objetivo, Escopo)."""
    title = re.sub(r"^#+\s+\d+\.\s*", "", header).strip().lower()
    return title in INTRO_SECTIONS


def _extract_doc_title(content: str) -> str:
    """Extrai o título (# ...) do documento."""
    m = re.match(r"^#\s+(.+)$", content, re.MULTILINE)
    return m.group(1).strip() if m else ""


def _split_sla_table(section_text: str) -> Optional[tuple[str, str]]:
    """Divide a tabela de SLAs em chamados gerais e incidentes críticos.

    Returns:
        Tupla (texto_chamados_gerais, texto_incidentes_criticos) ou None.
    """
    lines = section_text.split("\n")
    header_lines = []
    general_rows = []
    critical_rows = []
    other_rows = []

    in_table = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("|") and "Métrica" in stripped:
            header_lines.append(stripped)
            in_table = True
            continue
        if in_table and stripped.startswith("|---"):
            header_lines.append(stripped)
            continue
        if in_table and stripped.startswith("|"):
            lower = stripped.lower()
            if "chamados gerais" in lower:
                general_rows.append(stripped)
            elif "incidentes críticos" in lower or "incidente" in lower:
                critical_rows.append(stripped)
            elif "disponibilidade" in lower or "gerente" in lower or "relatório" in lower:
                other_rows.append(stripped)
            else:
                other_rows.append(stripped)
            continue
        if in_table and not stripped.startswith("|"):
            in_table = False

    if not general_rows and not critical_rows:
        return None

    header_block = "\n".join(header_lines)
    general_text = header_block + "\n" + "\n".join(general_rows + other_rows)
    critical_text = header_block + "\n" + "\n".join(critical_rows)

    return general_text, critical_text


def chunk_all_documents(documents: dict[str, str]) -> list[Chunk]:
    """Divide todos os documentos em chunks semânticos alinhados ao Anexo B.

    Args:
        documents: Dicionário {doc_id: conteúdo_markdown}.

    Returns:
        Lista de Chunk com metadados.
    """
    all_chunks = []

    for doc_id, content in documents.items():
        meta = DOCUMENT_METADATA.get(doc_id, {
            "document_type": "desconhecido",
            "version": "desconhecida",
            "is_informal_source": False,
        })
        doc_title = _extract_doc_title(content)

        if doc_id == "FAQ-Atendimento":
            chunks = _chunk_faq(doc_id, doc_title, content, meta)
        elif doc_id == "SLA-2024":
            chunks = _chunk_sla(doc_id, doc_title, content, meta)
        else:
            chunks = _chunk_standard_document(doc_id, doc_title, content, meta)

        all_chunks.extend(chunks)

    print(f"✓ Chunking concluído: {len(all_chunks)} chunks gerados")
    for c in all_chunks:
        print(f"  {c.chunk_id}: {c.source_document} / {c.section} ({len(c.text)} chars)")

    return all_chunks


def _chunk_standard_document(
    doc_id: str, doc_title: str, content: str, meta: dict
) -> list[Chunk]:
    """Chunking para documentos padrão (POL, PROC).

    Cada seção ## gera um chunk. Se a seção tem subseções ###,
    a intro (antes da primeira ###) gera um chunk e cada ### gera outro.
    Seções de introdução (Objetivo, Escopo) são descartadas.
    """
    chunks = []
    chunk_letter = ord("A")

    sections = _split_by_headers(content, "##")

    for sec_header, sec_body in sections:
        if _is_intro_section(sec_header):
            continue

        section_title = re.sub(r"^##\s+\d+\.\s*", "", sec_header).strip()

        # Verifica se tem subseções (###)
        subsections = _split_by_headers(sec_body, "###")

        if subsections:
            # Texto antes da primeira ### (intro da seção ##)
            first_sub_pos = sec_body.find("###")
            intro_text = sec_body[:first_sub_pos].strip() if first_sub_pos > 0 else ""

            if intro_text:
                cid = f"{doc_id}-{chr(chunk_letter)}"
                chunks.append(Chunk(
                    chunk_id=cid,
                    text=f"{sec_header}\n\n{intro_text}",
                    source_document=doc_id,
                    section=section_title,
                    title=doc_title,
                    document_type=meta["document_type"],
                    version=meta["version"],
                    is_informal_source=meta["is_informal_source"],
                ))
                chunk_letter += 1

            for sub_header, sub_body in subsections:
                sub_title = re.sub(r"^###\s+\d+\.\d+\.\s*", "", sub_header).strip()
                cid = f"{doc_id}-{chr(chunk_letter)}"
                chunks.append(Chunk(
                    chunk_id=cid,
                    text=f"{sub_header}\n\n{sub_body}",
                    source_document=doc_id,
                    section=sub_title,
                    title=doc_title,
                    document_type=meta["document_type"],
                    version=meta["version"],
                    is_informal_source=meta["is_informal_source"],
                ))
                chunk_letter += 1
        else:
            cid = f"{doc_id}-{chr(chunk_letter)}"
            chunks.append(Chunk(
                chunk_id=cid,
                text=f"{sec_header}\n\n{sec_body}",
                source_document=doc_id,
                section=section_title,
                title=doc_title,
                document_type=meta["document_type"],
                version=meta["version"],
                is_informal_source=meta["is_informal_source"],
            ))
            chunk_letter += 1

    return chunks


def _chunk_sla(
    doc_id: str, doc_title: str, content: str, meta: dict
) -> list[Chunk]:
    """Chunking específico para SLA-2024.

    A seção 2 (Tabela de SLAs) é dividida em dois chunks:
    - B: SLAs para chamados gerais
    - C: SLAs para incidentes críticos
    Conforme definido no Anexo B de referência.
    """
    chunks = []
    chunk_letter = ord("A")

    sections = _split_by_headers(content, "##")

    for sec_header, sec_body in sections:
        if _is_intro_section(sec_header):
            continue

        section_title = re.sub(r"^##\s+\d+\.\s*", "", sec_header).strip()
        full_text = f"{sec_header}\n\n{sec_body}"

        # Seção 2: dividir tabela em chamados gerais vs incidentes
        if "tabela de sla" in section_title.lower():
            split_result = _split_sla_table(full_text)
            if split_result:
                general_text, critical_text = split_result

                # Chunk B: chamados gerais
                cid_general = f"{doc_id}-{chr(chunk_letter)}"
                chunks.append(Chunk(
                    chunk_id=cid_general,
                    text=f"{sec_header}\n\nSLAs para chamados gerais:\n\n{general_text}",
                    source_document=doc_id,
                    section="Tabela de SLAs (chamados gerais)",
                    title=doc_title,
                    document_type=meta["document_type"],
                    version=meta["version"],
                    is_informal_source=meta["is_informal_source"],
                ))
                chunk_letter += 1

                # Chunk C: incidentes críticos
                cid_critical = f"{doc_id}-{chr(chunk_letter)}"
                chunks.append(Chunk(
                    chunk_id=cid_critical,
                    text=f"{sec_header}\n\nSLAs para incidentes críticos:\n\n{critical_text}",
                    source_document=doc_id,
                    section="Tabela de SLAs (incidentes críticos)",
                    title=doc_title,
                    document_type=meta["document_type"],
                    version=meta["version"],
                    is_informal_source=meta["is_informal_source"],
                ))
                chunk_letter += 1
                continue

        # Seções normais
        cid = f"{doc_id}-{chr(chunk_letter)}"
        chunks.append(Chunk(
            chunk_id=cid,
            text=full_text,
            source_document=doc_id,
            section=section_title,
            title=doc_title,
            document_type=meta["document_type"],
            version=meta["version"],
            is_informal_source=meta["is_informal_source"],
        ))
        chunk_letter += 1

    return chunks


def _chunk_faq(
    doc_id: str, doc_title: str, content: str, meta: dict
) -> list[Chunk]:
    """Chunking para FAQ: cada item gera um chunk individual."""
    chunks = []

    # Divide por ### Item N
    items = _split_by_headers(content, "###")

    for item_header, item_body in items:
        m = re.search(r"Item\s+(\d+)", item_header)
        if not m:
            continue

        item_num = m.group(1).zfill(2)
        cid = f"FAQ-{item_num}"

        # Extrai título do item
        title_match = re.search(r'[—–-]\s*"(.+?)"', item_header)
        item_title = title_match.group(1) if title_match else item_header

        chunks.append(Chunk(
            chunk_id=cid,
            text=f"[Fonte: {doc_id} — Documento informal/não validado]\n\n{item_header}\n{item_body}",
            source_document=doc_id,
            section=item_title,
            title=doc_title,
            document_type=meta["document_type"],
            version=meta["version"],
            is_informal_source=meta["is_informal_source"],
            metadata={"faq_item": int(m.group(1))},
        ))

    return chunks

