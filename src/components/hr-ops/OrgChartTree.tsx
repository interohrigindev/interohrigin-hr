/**
 * OrgChartTree — 조직도 시각적 트리 다이어그램
 * CSS flexbox + border 기반 커넥터 라인
 */
import { Building2, Users } from 'lucide-react'

interface Employee {
  id: string
  name: string
  department_id: string | null
  position: string | null
  hire_date: string | null
}

interface Department {
  id: string
  name: string
  parent_id: string | null
}

interface DeptTree extends Department {
  children: DeptTree[]
  employees: Employee[]
}

interface OrgChartTreeProps {
  tree: DeptTree[]
  onDeptClick?: (deptId: string) => void
}

function countAllEmployees(dept: DeptTree): number {
  let count = dept.employees.length
  for (const child of dept.children) {
    count += countAllEmployees(child)
  }
  return count
}

function OrgNode({ dept, onDeptClick, isRoot }: { dept: DeptTree; onDeptClick?: (id: string) => void; isRoot?: boolean }) {
  const totalEmps = countAllEmployees(dept)
  const hasChildren = dept.children.length > 0

  return (
    <div className="flex flex-col items-center">
      {/* Node box */}
      <button
        onClick={() => onDeptClick?.(dept.id)}
        className={`
          relative px-4 py-2.5 rounded-lg border-2 text-center min-w-[120px] max-w-[180px]
          transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer
          ${isRoot
            ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-700 text-white shadow-lg'
            : hasChildren
              ? 'bg-white border-blue-300 hover:border-blue-500'
              : 'bg-gray-50 border-gray-200 hover:border-blue-400'
          }
        `}
      >
        <div className="flex items-center justify-center gap-1.5 mb-0.5">
          <Building2 className={`h-3.5 w-3.5 ${isRoot ? 'text-blue-200' : 'text-blue-500'}`} />
          <span className={`text-xs font-bold truncate ${isRoot ? 'text-white' : 'text-gray-900'}`}>
            {dept.name}
          </span>
        </div>
        <div className={`flex items-center justify-center gap-1 ${isRoot ? 'text-blue-200' : 'text-gray-500'}`}>
          <Users className="h-3 w-3" />
          <span className="text-[10px] font-medium">{totalEmps}명</span>
        </div>
      </button>

      {/* Children with connector lines */}
      {hasChildren && (
        <>
          {/* Vertical line down from parent */}
          <div className="w-px h-5 bg-gray-300" />

          {/* Horizontal connector + children */}
          <div className="relative flex">
            {/* Horizontal line spanning all children */}
            {dept.children.length > 1 && (
              <div
                className="absolute top-0 h-px bg-gray-300"
                style={{
                  left: '50%',
                  right: '50%',
                  // Will be overridden by the container below
                }}
              />
            )}

            <div className="flex gap-2 relative">
              {/* Horizontal line across top of children */}
              {dept.children.length > 1 && (
                <div className="absolute top-0 left-[calc(50%/var(--child-count))] right-[calc(50%/var(--child-count))] h-px bg-gray-300"
                  style={{
                    left: `calc(100% / ${dept.children.length * 2})`,
                    right: `calc(100% / ${dept.children.length * 2})`,
                  }}
                />
              )}

              {dept.children.map((child) => (
                <div key={child.id} className="flex flex-col items-center">
                  {/* Vertical line down to child */}
                  <div className="w-px h-5 bg-gray-300" />
                  <OrgNode dept={child} onDeptClick={onDeptClick} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function OrgChartTree({ tree, onDeptClick }: OrgChartTreeProps) {
  if (tree.length === 0) return null

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex justify-center gap-8 min-w-fit py-4 px-6">
        {tree.map((root) => (
          <OrgNode key={root.id} dept={root} onDeptClick={onDeptClick} isRoot />
        ))}
      </div>
    </div>
  )
}
