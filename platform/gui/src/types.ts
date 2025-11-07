export interface BacklogTask {
  id: string
  title: string
  owner: string
  area: string
  deps: string[]
  dod: string[]
  tests: string[]
  artifacts: string[]
  estimate_points: number
  tags: string[]
  notes: string
}

export interface Backlog {
  version: number
  generated_at: string
  tasks: BacklogTask[]
}

export interface DeliverableLink {
  id: string
  label: string
  href: string
  description?: string
}

export interface PromptStage {
  id: string
  name: string
  description: string
  deliverables: DeliverableLink[]
}

export type TimelineItem =
  | {
      type: "prompt"
      stage: PromptStage
    }
  | {
      type: "task"
      task: BacklogTask
    }
