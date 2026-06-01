/**
 * Flattens a hierarchical task tree into a display-order array.
 * Both TaskList and GanttChart use this to ensure row alignment.
 */
export function flattenTasks(tasks) {
  const result = [];
  const rootTasks = tasks.filter(t => !t.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  
  const addTask = (task) => {
    result.push(task);
    const children = tasks.filter(t => t.parent_id === task.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    children.forEach(addTask);
  };
  
  rootTasks.forEach(addTask);
  return result;
}