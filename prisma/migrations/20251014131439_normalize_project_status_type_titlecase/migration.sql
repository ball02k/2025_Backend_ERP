-- Normalize stored values to Title Case (Status, Type)
UPDATE "Project" SET status = INITCAP(status) WHERE status IS NOT NULL;
UPDATE "Project" SET type = INITCAP(type) WHERE type IS NOT NULL;
