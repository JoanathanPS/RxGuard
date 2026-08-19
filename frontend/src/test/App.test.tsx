import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../App";

function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App routing", () => {
  it("redirects anonymous visitors to the login page", () => {
    localStorage.clear();
    renderApp("/patients");
    expect(screen.getByText("RxGuard")).toBeInTheDocument();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("renders the dashboard after login", () => {
    localStorage.setItem("rxguard_token", "test-token");
    renderApp("/patients");
    expect(
      screen.getByRole("heading", { name: "Patients" }),
    ).toBeInTheDocument();
    localStorage.clear();
  });
});