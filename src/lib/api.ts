import { notifications } from "@mantine/notifications";
import type { OperationResult } from "../../shared/contracts";

export function unwrap<T>(result: OperationResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(result.error.details || result.error.message);
}

export async function action<T>(
  promise: Promise<OperationResult<T>>,
  successMessage?: string,
): Promise<T> {
  try {
    const data = unwrap(await promise);
    if (successMessage)
      notifications.show({
        color: "teal",
        title: "Done",
        message: successMessage,
      });
    return data;
  } catch (error) {
    notifications.show({
      color: "red",
      title: "Operation failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}
