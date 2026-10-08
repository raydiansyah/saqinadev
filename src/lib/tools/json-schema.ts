/**
 * Minimal JSON Schema validator for tool inputs (a subset of draft-07): type, properties,
 * required, additionalProperties: false, enum, items, string length, number range. Tools from
 * MCP servers describe their input this way; anything the subset cannot express passes
 * through to the server, which validates again.
 */

export type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  enum?: unknown[];
  items?: Schema;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
};

export interface SchemaError {
  path: string;
  message: string;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function typeMatches(expected: string, actual: string): boolean {
  return expected === actual || (expected === "number" && actual === "integer");
}

export function validateJson(
  schema: Schema,
  value: unknown,
  path = "$",
  errors: SchemaError[] = [],
): SchemaError[] {
  if (errors.length > 20) return errors;
  const actual = typeOf(value);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(t, actual))) {
      errors.push({ path, message: `expected ${types.join("|")}` });
      return errors;
    }
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value)))
    errors.push({ path, message: "not allowed" });
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      errors.push({ path, message: "too short" });
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      errors.push({ path, message: "too long" });
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push({ path, message: "too small" });
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push({ path, message: "too large" });
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push({ path, message: "too many items" });
    if (schema.items)
      value.forEach((item, i) =>
        validateJson(schema.items as Schema, item, `${path}[${i}]`, errors),
      );
  }
  if (actual === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? [])
      if (!(key in obj) || obj[key] === undefined)
        errors.push({ path: `${path}.${key}`, message: "required" });
    for (const [key, child] of Object.entries(obj)) {
      const prop = schema.properties?.[key];
      if (prop) validateJson(prop, child, `${path}.${key}`, errors);
      else if (schema.additionalProperties === false)
        errors.push({ path: `${path}.${key}`, message: "unexpected" });
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object")
        validateJson(schema.additionalProperties, child, `${path}.${key}`, errors);
    }
  }
  return errors;
}
