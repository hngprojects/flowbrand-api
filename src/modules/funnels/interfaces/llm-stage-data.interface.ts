export interface StageTaskData {
  taskText: string;
}

export interface LlmStageData {
  position: number;
  channel: string;
  explanation: string;
  actionPrompt: string;
  tasks: StageTaskData[];
}
