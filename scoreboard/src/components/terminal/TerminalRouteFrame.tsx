import { type ComponentProps, type CSSProperties, type ReactNode } from "react";
import TerminalHeader from "./TerminalHeader";
import TerminalScreen from "./TerminalScreen";

type TerminalRouteHeaderProps = ComponentProps<typeof TerminalHeader>;

interface TerminalRouteFrameProps extends TerminalRouteHeaderProps {
  children: ReactNode;
  bodyStyle?: CSSProperties;
}

interface TerminalRouteMessageProps extends TerminalRouteHeaderProps {
  message: ReactNode;
  bodyStyle?: CSSProperties;
  messageStyle?: CSSProperties;
}

const frameStyle: CSSProperties = {
  height: "100dvh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const bodyBaseStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
};

const messageBaseStyle: CSSProperties = {
  height: "100%",
  overflow: "auto",
  padding: "3rem",
  color: "var(--text-dim)",
  fontFamily: "IBM Plex Mono",
  fontSize: "0.8rem",
};

export default function TerminalRouteFrame({
  children,
  bodyStyle,
  ...headerProps
}: TerminalRouteFrameProps) {
  return (
    <TerminalScreen>
      <div style={frameStyle}>
        <TerminalHeader {...headerProps} />
        <div style={{ ...bodyBaseStyle, ...bodyStyle }}>{children}</div>
      </div>
    </TerminalScreen>
  );
}

export function TerminalRouteMessage({
  message,
  bodyStyle,
  messageStyle,
  ...headerProps
}: TerminalRouteMessageProps) {
  return (
    <TerminalRouteFrame {...headerProps} bodyStyle={bodyStyle}>
      <div style={{ ...messageBaseStyle, ...messageStyle }}>{message}</div>
    </TerminalRouteFrame>
  );
}
