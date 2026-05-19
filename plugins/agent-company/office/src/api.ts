// 대시보드가 로컬 Agent Company 상태 API를 호출한다.
import type { OfficeState } from "./officeTypes";

export interface OfficeStateSubscription {
  close: () => void;
}

export async function fetchOfficeState(): Promise<OfficeState> {
  const response = await fetch("/api/company/state", {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Agent Company state request failed with ${response.status}`);
  }

  return await response.json() as OfficeState;
}

export function subscribeToOfficeState(
  onState: (state: OfficeState) => void,
  onError: () => void,
): OfficeStateSubscription | null {
  if (typeof EventSource === "undefined") {
    return null;
  }

  const source = new EventSource("/api/company/events");

  source.addEventListener("state", (event) => {
    try {
      onState(JSON.parse((event as MessageEvent<string>).data) as OfficeState);
    } catch {
      onError();
    }
  });
  source.addEventListener("error", () => {
    onError();
  });

  return {
    close: () => source.close(),
  };
}
