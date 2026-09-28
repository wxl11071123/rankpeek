import { ref } from 'vue'

export const coachAnalysisBusy = ref(false)

let serial = 0
export function nextRunAnalysisSerial(): number {
  return ++serial
}
export function getRunAnalysisSerial(): number {
  return serial
}
