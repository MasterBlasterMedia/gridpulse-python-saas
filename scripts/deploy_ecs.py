"""Deploy a digest-pinned ECS release only after its migration task succeeds."""

import json
import os
import subprocess
import tempfile
from pathlib import Path


def aws(*arguments: str) -> dict:
    """Keep AWS CLI parameters separate from shell parsing and parse structured responses."""
    result = subprocess.run(
        ["aws", *arguments, "--output", "json"],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout) if result.stdout.strip() else {}


def main() -> None:
    """Register a revision, migrate with its code, then roll the service forward."""
    current = aws(
        "ecs", "describe-task-definition", "--task-definition", "gridpulse-api"
    )["taskDefinition"]
    # DescribeTaskDefinition includes server-only fields that RegisterTaskDefinition rejects.
    allowed = {
        "family",
        "taskRoleArn",
        "executionRoleArn",
        "networkMode",
        "containerDefinitions",
        "volumes",
        "placementConstraints",
        "requiresCompatibilities",
        "cpu",
        "memory",
        "runtimePlatform",
        "ephemeralStorage",
    }
    task = {key: value for key, value in current.items() if key in allowed}
    task["containerDefinitions"][0]["image"] = os.environ["RELEASE_IMAGE"]
    with tempfile.TemporaryDirectory() as directory:
        config = Path(directory) / "task.json"
        config.write_text(json.dumps(task))
        revision = aws(
            "ecs", "register-task-definition", "--cli-input-json", f"file://{config}"
        )["taskDefinition"]["taskDefinitionArn"]
    network = {
        "awsvpcConfiguration": {
            "subnets": os.environ["ECS_SUBNETS"].split(","),
            "securityGroups": [os.environ["ECS_SECURITY_GROUP"]],
            "assignPublicIp": "ENABLED",
        }
    }
    release = aws(
        "ecs",
        "run-task",
        "--cluster",
        "gridpulse",
        "--launch-type",
        "FARGATE",
        "--task-definition",
        revision,
        "--network-configuration",
        json.dumps(network),
        "--overrides",
        json.dumps(
            {
                "containerOverrides": [
                    {
                        "name": "api",
                        "command": [
                            "sh",
                            "-c",
                            "alembic upgrade head && python -m app.seed",
                        ],
                    }
                ]
            }
        ),
    )
    if release.get("failures") or not release.get("tasks"):
        raise SystemExit("ECS rejected the migration task; service was not updated")
    task_arn = release["tasks"][0]["taskArn"]
    subprocess.run(
        [
            "aws",
            "ecs",
            "wait",
            "tasks-stopped",
            "--cluster",
            "gridpulse",
            "--tasks",
            task_arn,
        ],
        check=True,
    )
    result = aws("ecs", "describe-tasks", "--cluster", "gridpulse", "--tasks", task_arn)
    if result["tasks"][0]["containers"][0].get("exitCode") != 0:
        raise SystemExit("Migration failed; service was not updated")
    aws(
        "ecs",
        "update-service",
        "--cluster",
        "gridpulse",
        "--service",
        "gridpulse-api",
        "--task-definition",
        revision,
        "--desired-count",
        "1",
    )
    subprocess.run(
        [
            "aws",
            "ecs",
            "wait",
            "services-stable",
            "--cluster",
            "gridpulse",
            "--services",
            "gridpulse-api",
        ],
        check=True,
    )
    deployed = aws(
        "ecs",
        "describe-services",
        "--cluster",
        "gridpulse",
        "--services",
        "gridpulse-api",
    )["services"][0]
    if deployed["taskDefinition"] != revision or deployed["runningCount"] != 1:
        raise SystemExit("ECS rolled back or failed to start the requested revision")
    print("Migration succeeded and the requested ECS revision is serving.")


if __name__ == "__main__":
    main()
