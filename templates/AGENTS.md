# {{PROJECT_NAME}}

This repository is bound to the Linear project **{{PROJECT_NAME}}**.

Work items live in that Linear project; each issue holds its own implementation
plan and context. When you need the "what / why" for a task, read that
project's issues -- do not reconstruct it from the code alone.

`.linear-cli.json` (uncommitted) binds this checkout to the project, so use the
`linear` CLI directly -- no `--project` / `--profile` needed:

    linear issue list
    linear issue get <ID>
    linear comment create <ID> --body "..."
