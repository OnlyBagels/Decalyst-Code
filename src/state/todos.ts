import type { EventBus } from "../events/bus.js";

export interface Todo {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "done" | "blocked";
  createdAt: number;
  updatedAt: number;
}

export class TodoStore {
  private todos: Map<string, Todo> = new Map();

  constructor(private bus: EventBus) {}

  replace(
    todos: Array<{ id: string; description: string; status?: Todo["status"] }>,
  ): void {
    this.todos.clear();
    const now = Date.now();
    for (const { id, description, status = "pending" } of todos) {
      this.todos.set(id, {
        id,
        description,
        status,
        createdAt: now,
        updatedAt: now,
      });
    }
    this.emitChange();
  }

  update(
    id: string,
    patch: Partial<Pick<Todo, "description" | "status">>,
  ): boolean {
    const todo = this.todos.get(id);
    if (!todo) return false;

    const updated: Todo = {
      ...todo,
      ...patch,
      updatedAt: Date.now(),
    };
    this.todos.set(id, updated);
    this.emitChange();
    return true;
  }

  get(id: string): Todo | undefined {
    return this.todos.get(id);
  }

  list(): Todo[] {
    return Array.from(this.todos.values());
  }

  private emitChange(): void {
    this.bus.emit({
      t: "todo_changed",
      todos: this.list(),
    });
  }
}
