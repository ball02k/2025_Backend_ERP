import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { hasError:false, err:null }; }
  static getDerivedStateFromError(e){ return { hasError:true, err:e }; }
  componentDidCatch(e, info){ console.error("ErrorBoundary(Info)", e, info); }
  render(){ return this.state.hasError ? <div className="text-sm text-red-600">Couldn’t load this section.</div> : this.props.children; }
}

