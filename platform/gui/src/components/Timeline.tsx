import type { TimelineItem } from "../types"

interface TimelineProps {
  items: TimelineItem[]
  onSelect: (item: TimelineItem) => void
}

export function Timeline({ items, onSelect }: TimelineProps) {
  return (
    <div className="card">
      <h2>Project Timeline</h2>
      <div className="timeline">
        {items.map((item, index) => (
          <div className="timeline-item" key={item.type === "prompt" ? `prompt-${item.stage.id}` : item.task.id}>
            <div className="timeline-marker" aria-hidden="true" />
            <button
              className="timeline-card"
              type="button"
              onClick={() => onSelect(item)}
              aria-label={`Open details for ${item.type === "prompt" ? item.stage.name : item.task.title}`}
            >
              {item.type === "prompt" ? (
                <>
                  <div className="timeline-card-header">
                    <h3>{item.stage.name}</h3>
                    <span className="timeline-pill">Prompt {index + 1}</span>
                  </div>
                  <p className="timeline-meta">{item.stage.description}</p>
                </>
              ) : (
                <>
                  <div className="timeline-card-header">
                    <h3>{item.task.title}</h3>
                    <span className="timeline-pill">Task</span>
                  </div>
                  <p className="timeline-meta">
                    Owner: <strong>{item.task.owner}</strong> · Area: <strong>{item.task.area}</strong> · Estimate:{" "}
                    {item.task.estimate_points}pt
                  </p>
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
