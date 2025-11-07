import type { DeliverableLink } from "../types"

interface DeliverablesCardProps {
  links: DeliverableLink[]
  title?: string
}

export function DeliverablesCard({ links, title = "Key Deliverables" }: DeliverablesCardProps) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <ul className="deliverable-list">
        {links.map((link) => (
          <li key={link.id} className="deliverable-item">
            <span>{link.label}</span>
            <a className="link-button" href={link.href} target="_blank" rel="noreferrer">
              View
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
