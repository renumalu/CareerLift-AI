import { QueryCache, QueryClient, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (typeof window === "undefined") return;
        import("sonner").then(({ toast }) => {
          toast.error(error instanceof Error ? error.message : "Something went wrong loading data.");
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (typeof window === "undefined") return;
        import("sonner").then(({ toast }) => {
          toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
        });
      },
    }),
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
