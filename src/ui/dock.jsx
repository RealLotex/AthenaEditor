/** Standard panel header with a title and optional actions. */
const PanelHeader = ({ title, children }) => (
  <div className="a-ph">
    <span className="a-ph__title">{title}</span>
    <span className="a-ph__actions">{children}</span>
  </div>
);
