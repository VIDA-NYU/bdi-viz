"use client";

import React from "react";
import { Tooltip, Box } from "@mui/material";

type UnifiedTooltipProps = {
  title: React.ReactNode | string;
  placement?: "bottom" | "left" | "right" | "top" | "bottom-end" | "bottom-start" | "left-end" | "left-start" | "right-end" | "right-start" | "top-end" | "top-start";
  children: React.ReactElement;
};

const UnifiedTooltip: React.FC<UnifiedTooltipProps> = ({ title, placement = "top", children }) => {
  const content = typeof title === "string"
    ? (
        <Box sx={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif', fontSize: 12, lineHeight: 1.4 }}>
          {title}
        </Box>
      )
    : (
        <Box sx={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif', fontSize: 12, lineHeight: 1.4 }}>
          {title}
        </Box>
      );

  return (
    <Tooltip arrow placement={placement} describeChild title={content}>
      {children}
    </Tooltip>
  );
};

export default UnifiedTooltip;


