import React, { ComponentProps, ComponentType, MouseEvent, ReactNode, useCallback, useRef } from 'react';

import CSRFForm from './CSRFForm';

interface QuickCreateCubeBaseProps {
  children?: ReactNode;
  className?: string;
}

/**
 * HOC that wraps any clickable component (Button, NavButton, NavLink, etc.) so
 * that clicking it instantly POSTs to /cube/quickadd, creating a new cube
 * named "${username}'s New Cube" and redirecting the user to it.
 *
 * Mirrors the API of withModal, replacing the modal with a CSRF form submit.
 */
const withQuickCreateCube = <T extends ComponentType<any>>(Tag: T) => {
  const Result: React.FC<QuickCreateCubeBaseProps & ComponentProps<T>> = (
    allProps: QuickCreateCubeBaseProps & ComponentProps<T>,
  ) => {
    const { children } = allProps;
    const formRef = useRef<HTMLFormElement>(null);

    const handleClick = useCallback((event?: MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
      }
      formRef.current?.submit();
    }, []);

    return (
      <CSRFForm method="POST" action="/cube/quickadd" formData={{}} ref={formRef}>
        <Tag {...(allProps as any)} onClick={handleClick}>
          {children}
        </Tag>
      </CSRFForm>
    );
  };
  Result.displayName = `withQuickCreateCube(${(Tag as any).displayName || (Tag as any).name || 'Component'})`;
  return Result;
};

export default withQuickCreateCube;
