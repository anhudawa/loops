import type { Instrumentation } from "next";
import { logSafeOperationalError } from "@/lib/error-descriptor";

export const onRequestError: Instrumentation.onRequestError = async (error) => {
  // Works in both Node and Edge runtimes. Hosting alerts consume this safe
  // structured log; caught API errors are additionally grouped in PostgreSQL.
  await logSafeOperationalError(error, "next_request");
};
