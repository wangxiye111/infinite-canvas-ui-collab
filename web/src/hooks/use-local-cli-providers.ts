import { useQuery, useQueryClient } from "@tanstack/react-query";
import { localCliApi, type LocalCliProvider } from "@/services/api/local-cli";

const queryKey = ["local-cli-providers"];

export function useLocalCliProviders(enabled = true) {
    const client = useQueryClient();
    const query = useQuery({ queryKey, queryFn: localCliApi.providers, enabled });
    const setProvider = (provider: LocalCliProvider) => {
        const loaded = client.getQueryData(queryKey) !== undefined;
        client.setQueryData<LocalCliProvider[]>(queryKey, (items = []) => items.some((item) => item.id === provider.id) ? items.map((item) => item.id === provider.id ? provider : item) : [...items, provider]);
        // A standalone setup check is not a complete provider list.
        if (!loaded) void client.invalidateQueries({ queryKey });
    };
    return { ...query, setProvider };
}
