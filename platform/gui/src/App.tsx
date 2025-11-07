import { useMemo, useState } from "react"
import { StatsCard } from "./components/StatsCard"
import { DeliverablesCard } from "./components/DeliverablesCard"
import { Timeline } from "./components/Timeline"
import { Modal } from "./components/Modal"
import { dashboardData, resolveRepoAsset } from "./data/projectData"
import type { TimelineItem } from "./types"

function formatDate(iso: string) {
  if (!iso) return "Unknown"
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export default function App() {
  const { projectIdea, stats, deliverables, timeline, prompts } = dashboardData
  const [selected, setSelected] = useState<TimelineItem | null>(null)

  const areaStats = useMemo(() => stats.tasksByAreaEntries.slice(0, 4), [stats.tasksByAreaEntries])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Codex Project Dashboard</h1>
        <p>{projectIdea.excerpt}</p>
        <span className="muted">Backlog last generated: {formatDate(stats.generatedAt)}</span>
      </header>

      <main className="app-content">
        <section className="grid stats">
          <StatsCard label="Total Tasks" value={stats.totalTasks} helper="Across all areas" />
          <StatsCard label="Active Owners" value={stats.totalOwners} helper="Unique assignees" />
          <StatsCard label="Prompt Stages" value={prompts.length} helper="Primary workflow checkpoints" />
          {areaStats.map((entry) => (
            <StatsCard key={entry.area} label={`${entry.area.toUpperCase()} Tasks`} value={entry.count} />
          ))}
        </section>

        <section className="card">
          <h2>Project Idea</h2>
          <div className="markdown-preview">
            <p>{projectIdea.details || projectIdea.excerpt}</p>
          </div>
        </section>

        <DeliverablesCard links={deliverables} />

        <Timeline items={timeline} onSelect={setSelected} />
      </main>

      {selected ? (
        <Modal
          title={selected.type === "prompt" ? selected.stage.name : selected.task.title}
          subtitle={
            selected.type === "prompt"
              ? "Prompt stage overview"
              : `Owner: ${selected.task.owner} • Area: ${selected.task.area} • Estimate: ${selected.task.estimate_points} pt`
          }
          onClose={() => setSelected(null)}
        >
          {selected.type === "prompt" ? (
            <div className="modal-section">
              <h4>Description</h4>
              <p>{selected.stage.description}</p>
              <h4>Deliverables</h4>
              <ul className="deliverable-list">
                {selected.stage.deliverables.map((deliverable) => (
                  <li key={deliverable.id} className="deliverable-item">
                    <span>{deliverable.label}</span>
                    <a className="link-button" href={deliverable.href} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </li>
                ))}
              </ul>
              <h4>Retro Count</h4>
              <span className="muted">Retro tracking not yet integrated.</span>
            </div>
          ) : (
            <div className="modal-section">
              <h4>Definition of Done</h4>
              <ul>
                {selected.task.dod.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
              <h4>Tests / Checks</h4>
              <ul>
                {selected.task.tests.map((test, index) => (
                  <li key={index}>{test}</li>
                ))}
              </ul>
              <h4>Artifacts</h4>
              {selected.task.artifacts.length ? (
                <ul className="deliverable-list">
                  {selected.task.artifacts.map((artifact) => (
                    <li key={artifact} className="deliverable-item">
                      <span>{artifact}</span>
                      <a className="link-button" href={resolveRepoAsset(artifact)} target="_blank" rel="noreferrer">
                        View
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="muted">No artifacts recorded.</span>
              )}
              <h4>Dependencies</h4>
              {selected.task.deps.length ? (
                <p>{selected.task.deps.join(", ")}</p>
              ) : (
                <span className="muted">Standalone task</span>
              )}
              <h4>Notes</h4>
              <p>{selected.task.notes || "No additional notes captured."}</p>
              <h4>Conversation</h4>
              <span className="muted">Conversation log integration is planned.</span>
              <h4>Retro Count</h4>
              <span className="muted">Retro tracking not yet integrated.</span>
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  )
}
