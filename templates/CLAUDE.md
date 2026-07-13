# {{PROJECT_NAME}}

## Linear

This repository is bound to the Linear project **{{PROJECT_NAME}}**.

- project: `{{PROJECT_NAME}}`
- project id: `{{PROJECT_ID}}`
- team: `{{TEAM_KEY}}`
- url: https://linear.app/{{ORG_URLKEY}}/project/{{PROJECT_SLUG_ID}}

Work items for this repository live in the Linear project above, and each
issue there holds its own implementation plan and context. When you need the
"what / why" for a task, read that project's issues — do not reconstruct it
from the code alone.

Use the `linear` CLI scoped to this project, e.g.:

    linear issue list --project "{{PROJECT_NAME}}"
    linear issue get <ID>

If context is still missing, open the project in Linear directly.
