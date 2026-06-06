export interface StageTaskData {
  name: string;
  taskText: string;
}

export interface LlmStageData {
  position: number;
  channel: string;
  explanation: string;
  actionPrompt: string;
  tasks: StageTaskData[];
}
