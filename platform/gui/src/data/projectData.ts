import projectIdeaRaw from "@workspace/docs/project-idea.md?raw"
import prdJson from "@workspace/platform/ARTIFACTS/prd.json"
import prdMarkdown from "@workspace/platform/ARTIFACTS/prd.md?raw"
import researchMarkdown from "@workspace/platform/ARTIFACTS/research.md?raw"
import architectureMarkdown from "@workspace/platform/ARTIFACTS/architecture.md?raw"
import backlogJson from "@workspace/platform/BACKLOG/backlog.json"
import uxFlowsMarkdown from "@workspace/platform/ARTIFACTS/ux_flows.md?raw"
import { type Backlog, type DeliverableLink, type PromptStage, type TimelineItem } from "../types"

const backlog = backlogJson as Backlog
const tasks = backlog.tasks ?? []

const uniqueOwners = new Set(tasks.map((task) => task.owner))
const tasksByArea = tasks.reduce<Record<string, number>>((acc, task) => {
  acc[task.area] = (acc[task.area] ?? 0) + 1
  return acc
}, {})

export const resolveRepoAsset = (repoRelativePath: string) =>
  new URL(`../../../../${repoRelativePath}`, import.meta.url).href

const deliverableLink = (label: string, repoRelativePath: string, description?: string): DeliverableLink => ({
  id: label.toLowerCase().replace(/\s+/g, "-"),
  label,
  href: resolveRepoAsset(repoRelativePath),
  description,
})

const promptStages: PromptStage[] = [
  {
    id: "intake-pm",
    name: "Intake PM",
    description: "Shape the product idea and capture requirements before research begins.",
    deliverables: [
      deliverableLink("PRD (JSON)", "platform/ARTIFACTS/prd.json"),
      deliverableLink("PRD (Markdown)", "platform/ARTIFACTS/prd.md"),
    ],
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Collect market signals, risks, and supporting evidence.",
    deliverables: [deliverableLink("Research Notes", "platform/ARTIFACTS/research.md")],
  },
  {
    id: "solution-architect",
    name: "Solution Architect",
    description: "Define the target architecture, system boundaries, and data flow.",
    deliverables: [
      deliverableLink("Architecture Overview", "platform/ARTIFACTS/architecture.md"),
      deliverableLink("Architecture JSON", "platform/ARTIFACTS/architecture.json"),
    ],
  },
  {
    id: "api-designer",
    name: "API Designer",
    description: "Specify the API contract and error catalog.",
    deliverables: [
      deliverableLink("OpenAPI Spec", "platform/ARTIFACTS/openapi.yaml"),
      deliverableLink("Error Catalog", "platform/ARTIFACTS/error_catalog.json"),
    ],
  },
  {
    id: "ux-designer",
    name: "UX Designer",
    description: "Map the end-to-end flows and route structure.",
    deliverables: [
      deliverableLink("UX Flows", "platform/ARTIFACTS/ux_flows.md"),
      deliverableLink("Route Map", "platform/ARTIFACTS/route_map.json"),
    ],
  },
  {
    id: "planner",
    name: "Planner",
    description: "Translate documents into an actionable backlog with dependencies.",
    deliverables: [deliverableLink("Backlog", "platform/BACKLOG/backlog.json")],
  },
  {
    id: "scaffolder",
    name: "Scaffolder / DevOps",
    description: "Prepare local development scripts and CI hooks.",
    deliverables: [
      deliverableLink("docker-compose.dev.yml", "docker-compose.dev.yml"),
      deliverableLink("start-dev.sh", "devops/start-dev.sh"),
      deliverableLink("stop-dev.sh", "devops/stop-dev.sh"),
    ],
  },
]

const timeline: TimelineItem[] = [
  ...promptStages.map((stage) => ({
    type: "prompt" as const,
    stage,
  })),
  ...tasks
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((task) => ({
      type: "task" as const,
      task,
    })),
]

const projectIdeaExcerpt = projectIdeaRaw.split(/\n\n/)[0]?.trim() ?? "No project idea captured yet."

export const dashboardData = {
  projectIdea: {
    title: "Project Summary",
    excerpt: projectIdeaExcerpt,
    details: prdJson.prd?.problem ?? "",
    prdMarkdown,
  },
  stats: {
    totalTasks: tasks.length,
    totalOwners: uniqueOwners.size,
    generatedAt: backlog.generated_at,
    tasksByAreaEntries: Object.entries(tasksByArea)
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count),
  },
  prompts: promptStages,
  timeline,
  deliverables: [
    deliverableLink("PRD (JSON)", "platform/ARTIFACTS/prd.json"),
    deliverableLink("Research", "platform/ARTIFACTS/research.md"),
    deliverableLink("Architecture", "platform/ARTIFACTS/architecture.md"),
    deliverableLink("OpenAPI", "platform/ARTIFACTS/openapi.yaml"),
    deliverableLink("UX Flows", "platform/ARTIFACTS/ux_flows.md"),
    deliverableLink("Backlog", "platform/BACKLOG/backlog.json"),
  ],
  references: {
    researchMarkdown,
    architectureMarkdown,
    uxFlowsMarkdown,
  },
}
