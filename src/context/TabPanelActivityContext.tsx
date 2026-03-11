import { createContext, useContext, type ReactNode } from "react";

const TabPanelActivityContext = createContext(true);

interface TabPanelActivityProviderProps {
  isActive: boolean;
  children: ReactNode;
}

export function TabPanelActivityProvider({
  isActive,
  children,
}: TabPanelActivityProviderProps) {
  return (
    <TabPanelActivityContext.Provider value={isActive}>
      {children}
    </TabPanelActivityContext.Provider>
  );
}

export function useIsTabPanelActive(): boolean {
  return useContext(TabPanelActivityContext);
}
