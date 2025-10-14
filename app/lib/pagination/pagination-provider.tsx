"use client";

import { useEffect, useState, ReactNode } from 'react';
import PaginationGlobalContext from './pagination-context';

const PaginationGlobalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const [totalPages, setTotalPages] = useState<number>(0);

    // Reset pagination on session change
    useEffect(() => {
        if (typeof window === "undefined") return;

        const resetOnSessionChange = () => {
            setPageNumber(1);
            setTotalPages(0);
        };

        const onStorage = (e: StorageEvent) => {
            if (e.key === "bdiviz_session_name") resetOnSessionChange();
        };

        window.addEventListener("bdiviz:session", resetOnSessionChange);
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener("bdiviz:session", resetOnSessionChange);
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    const value = {
        pageNumber,
        setPageNumber,
        pageSize,
        setPageSize,
        totalPages,
        setTotalPages,
    }

    return (
        <PaginationGlobalContext.Provider value={value}>
            {children}
        </PaginationGlobalContext.Provider>
    );
}

export default PaginationGlobalProvider;

