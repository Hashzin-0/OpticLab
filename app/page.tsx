"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { runAutoEdit } from "@/lib/editing/pipeline";
import type { EditPlan } from "@/lib/editing/schema";

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler a imagem."));
    reader.onerror = () => reject(new Error("Falha ao ler a imagem."));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState("Envie uma fotografia para começar.");
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  async function processImage(dataUrl: string, refinement?: string, previousPlan: EditPlan | null = plan) {
    setBusy(true);
    setStatus(refinement ? "Reinterpretando sua solicitação…" : "Analisando e corrigindo sua fotografia…");
    try {
      const result = await runAutoEdit(
        dataUrl,
        refinement ?? "Faça uma correção fotográfica profissional, natural e fiel à captura original.",
        previousPlan,
      );
      const output = result.image;
      setPlan(result.plan);
      setEdited(output);
      setStatus("Fotografia processada. Você pode pedir outra alteração.");
      setInstruction("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ocorreu um erro durante a edição.");
    } finally {
      setBusy(false);
    }
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setStatus("Formato não suportado. Use JPG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus("A imagem excede o limite inicial de 6 MB.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setOriginal(dataUrl);
      setEdited(null);
      setPlan(null);
      setShowOriginal(false);
      await processImage(dataUrl, undefined, null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível abrir a imagem.");
    }
  }

  async function onRefine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!original || !instruction.trim() || busy) return;
    await processImage(original, instruction.trim());
  }

  const visibleImage = showOriginal ? original : edited;

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="OpticLab início"><span className="brand-mark">O</span> OPTICLAB</a>
        <span className="topbar-note">Computational photography · AI-assisted</span>
      </header>

      <section className="intro">
        <p className="eyebrow">AUTONOMOUS PHOTO PROCESSING</p>
        <h1>Uma boa fotografia.<br /><span>Sem precisar editá-la.</span></h1>
        <p className="intro-copy">Envie a imagem. O OpticLab analisa a fotografia e aplica automaticamente uma primeira correção de luz, contraste e cor. Recursos avançados de ruído e óptica serão incorporados nas próximas etapas.</p>
      </section>

      {!original && (
        <button className="upload-zone" onClick={() => inputRef.current?.click()} disabled={busy}>
          <span className="upload-icon">＋</span>
          <strong>Enviar fotografia</strong>
          <span>JPG, PNG ou WebP · até 3 MB nesta versão</span>
          <span className="upload-cta">Selecionar imagem</span>
        </button>
      )}

      <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} />

      {original && (
        <section className="workspace" aria-label="Resultado da edição">
          <div className="workspace-head">
            <div><p className="eyebrow">SUA FOTOGRAFIA</p><h2>{busy ? "Trabalhando na imagem" : "Resultado"}</h2></div>
            <button className="text-button" onClick={() => inputRef.current?.click()} disabled={busy}>Trocar imagem</button>
          </div>
          <div className="preview">
            {visibleImage ? <img src={visibleImage} alt={showOriginal ? "Fotografia original" : "Fotografia corrigida"} /> : <div className="processing-placeholder">Preparando prévia…</div>}
            {busy && <div className="processing-overlay"><span className="spinner" />{status}</div>}
          </div>
          <div className="preview-actions">
            <button className={showOriginal ? "pill active" : "pill"} onClick={() => setShowOriginal(true)} disabled={busy}>Original</button>
            <button className={!showOriginal ? "pill active" : "pill"} onClick={() => setShowOriginal(false)} disabled={!edited || busy}>Corrigida</button>
            {edited && <a className="download-button" href={edited} download="opticlab-corrigida.png">Baixar imagem ↓</a>}
          </div>
          <p className="status" role="status">{status}</p>
          {edited && (
            <form className="refine" onSubmit={onRefine}>
              <label htmlFor="instruction">Quer mudar alguma coisa?</label>
              <div className="refine-row">
                <input id="instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Ex.: ilumine o rosto e preserve o fundo escuro…" maxLength={500} disabled={busy} />
                <button type="submit" disabled={busy || !instruction.trim()}>Aplicar</button>
              </div>
              <p>Descreva o resultado desejado. O sistema recalcula a edição a partir do original.</p>
            </form>
          )}
          {plan && <p className="subtle-note">Edição calculada automaticamente · {plan.regions.length} regiões identificadas</p>}
        </section>
      )}

      <footer><span>OpticLab</span><span>O original permanece preservado. Cada revisão é recalculada a partir dele.</span></footer>
    </main>
  );
}