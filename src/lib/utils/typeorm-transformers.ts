import { DateTime } from "luxon";
import { type ValueTransformer } from "typeorm";

export const typeOrmDateTimeTransformer: ValueTransformer = {
  to(value: DateTime | Date): number | undefined {
    if (value instanceof DateTime) {
      return value.toMillis();
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    return undefined;
  },
  from(value: number | Date): DateTime | undefined {
    if (typeof value === "number") {
      return DateTime.fromMillis(value);
    }
    if (value instanceof Date) {
      return DateTime.fromJSDate(value);
    }
    return undefined;
  },
};