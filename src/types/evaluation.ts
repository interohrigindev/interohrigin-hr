import type {
  Employee,
  EvaluationTarget,
} from './database'

export interface EvaluationTargetWithEmployee extends EvaluationTarget {
  employee: Employee
}
