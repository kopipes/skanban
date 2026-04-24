# Simple Kanban Work Process

Simple Kanban app with SQLite persistence for tracking:

- Project and project status
- Task list per project
- Task progress (%)
- Progress detail update
- Notes for project and task
- 4-stage board: To Do, In Progress, Review, Done

## Run

1. Run backend server:

```bash
cd /Users/bob/Documents/Apps/skanban
python3 server.py --host 127.0.0.1 --port 4173
```

2. Open `http://localhost:4173` in browser.
3. Click `+ New Project` to create project (with deadline and notes).
4. Select project from top project tabs.
5. Click `+ Add Task` (or `+ add task` in each column).
6. Click `Details` on task card to update status/progress/detail/notes.
7. Drag task cards to move across columns or reorder inside the same column.
8. Drag project tabs to reorder project sequence.
9. Use top menu `Active` / `Archive` to switch project lists.
10. Project with status `Completed` will automatically move to `Archive`.
11. Delete project is available in project `Details`, with required confirmation text `DELETE PROJECT` and password `Shushitei99`.

## Data

Data is saved in SQLite database file:

`/Users/bob/Documents/Apps/skanban/skanban.db`

The app state is stored through API endpoint `/api/state`.

## Operations Protocol

See source-of-truth and release process:

`/Users/bob/Documents/Apps/skanban/PROTOCOL_SOURCE_OF_TRUTH.md`

VPS deploy command (from git):

`cd /home/ubuntu/board && bash scripts/deploy_from_git.sh`
